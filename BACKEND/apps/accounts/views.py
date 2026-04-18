"""APIView endpoints for authentication and profile operations."""

from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.common.audit import write_audit_log

from .permissions import HasUsersModulePermission, IsAdminOrSuperAdmin
from .models import Permission, RolePermissionProfile
from .rbac import MODULES, clear_rbac_cache
from .serializers import (
    MeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    UserSerializer,
)

User = get_user_model()


class LoginThrottle(AnonRateThrottle):
    """Rate limit login attempts."""

    scope = "login"


class PasswordResetThrottle(AnonRateThrottle):
    """Rate limit password reset requests."""

    scope = "password_reset"


class LoginView(TokenObtainPairView):
    """Obtain JWT pair; records last login IP on success."""

    throttle_classes = [LoginThrottle]

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code != status.HTTP_200_OK:
            return response
        email = request.data.get("email")
        if not email:
            return response
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return response
        client_ip = request.META.get("REMOTE_ADDR")
        if client_ip:
            user.last_login_ip = client_ip
            user.save(update_fields=["last_login_ip"])
        write_audit_log(
            user=user,
            action="login",
            instance=user,
            changes={},
            request=request,
        )
        return response


class RegisterView(generics.CreateAPIView):
    """Create users (admin or super_admin only)."""

    serializer_class = RegisterSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrSuperAdmin, HasUsersModulePermission]

    def perform_create(self, serializer) -> None:
        serializer.save()


class MeView(generics.RetrieveUpdateAPIView):
    """Get and update current authenticated user."""

    serializer_class = MeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class LogoutView(APIView):
    """Logout user by blacklisting refresh token."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        token = RefreshToken(refresh_token)
        token.blacklist()
        write_audit_log(
            user=request.user,
            action="logout",
            instance=request.user,
            changes={},
            request=request,
        )
        return Response(
            {
                "status": "success",
                "data": {},
                "message": "Logout successful",
            }
        )


class PasswordResetRequestView(APIView):
    """Request a password reset (email with uid/token for SPA confirm)."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [PasswordResetThrottle]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        users = User.objects.filter(email=email, is_active=True)
        if not users.exists():
            return Response(
                {
                    "message": "If the email exists, instructions were sent.",
                }
            )
        user = users.first()
        uid = urlsafe_base64_encode(force_bytes(str(user.pk)))
        token = default_token_generator.make_token(user)
        body = (
            "You requested a password reset for Valfora Holdings ERP.\n\n"
            f"uid: {uid}\n"
            f"token: {token}\n\n"
            "Send these values to POST /api/v1/auth/password-reset-confirm/ "
            "with your new password."
        )
        send_mail(
            subject="Valfora Holdings ERP password reset",
            message=body,
            from_email=None,
            recipient_list=[user.email],
            fail_silently=True,
        )
        return Response(
            {
                "message": "If the email exists, instructions were sent.",
            }
        )


class PasswordResetConfirmView(APIView):
    """Confirm password reset with uid and token."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        uid_b64 = serializer.validated_data["uid"]
        raw_token = serializer.validated_data["token"]
        password = serializer.validated_data["password"]
        try:
            uid = force_str(urlsafe_base64_decode(uid_b64))
            user = User.objects.get(pk=uid, is_active=True)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            return Response(
                {"detail": "Invalid reset link."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not default_token_generator.check_token(user, raw_token):
            return Response(
                {"detail": "Invalid or expired token."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.set_password(password)
        user.save()
        return Response({"message": "Password has been reset."})


class RolePermissionMatrixView(APIView):
    """Manage module/action permissions for built-in roles."""

    permission_classes = [permissions.IsAuthenticated, IsAdminOrSuperAdmin, HasUsersModulePermission]

    ROLE_CHOICES = (
        ("super_admin", "Super Admin"),
        ("admin", "Admin"),
        ("collaborator", "Collaborator"),
    )

    def get(self, request):
        perms = Permission.objects.filter(is_active=True, action__in=["view", "edit"]).order_by("module", "action")
        profile_map = {
            p.role_code: {str(x) for x in p.permissions.values_list("id", flat=True)}
            for p in RolePermissionProfile.objects.prefetch_related("permissions")
        }

        modules = []
        for module in MODULES:
            view_perm = next((p for p in perms if p.module == module and p.action == "view"), None)
            edit_perm = next((p for p in perms if p.module == module and p.action == "edit"), None)
            modules.append(
                {
                    "module": module,
                    "label": module.replace("_", " ").title(),
                    "view_permission_id": str(view_perm.id) if view_perm else None,
                    "edit_permission_id": str(edit_perm.id) if edit_perm else None,
                }
            )

        matrix = {}
        for role, _label in self.ROLE_CHOICES:
            role_set = profile_map.get(role, set())
            matrix[role] = {}
            for module in modules:
                view_id = module["view_permission_id"]
                edit_id = module["edit_permission_id"]
                matrix[role][module["module"]] = {
                    "view": bool(view_id and view_id in role_set),
                    "edit": bool(edit_id and edit_id in role_set),
                }

        return Response(
            {
                "roles": [{"role": code, "label": label} for code, label in self.ROLE_CHOICES],
                "modules": modules,
                "matrix": matrix,
            }
        )

    def patch(self, request):
        matrix = request.data.get("matrix")
        if not isinstance(matrix, dict):
            return Response({"detail": "matrix must be an object"}, status=status.HTTP_400_BAD_REQUEST)

        perms = Permission.objects.filter(is_active=True, action__in=["view", "edit"])
        perm_by_key = {(p.module, p.action): p.id for p in perms}
        valid_roles = {code for code, _ in self.ROLE_CHOICES}

        for role_code, role_matrix in matrix.items():
            if role_code not in valid_roles or not isinstance(role_matrix, dict):
                continue
            profile, _created = RolePermissionProfile.objects.get_or_create(role_code=role_code)
            selected_ids = []
            for module in MODULES:
                actions = role_matrix.get(module, {}) if isinstance(role_matrix.get(module, {}), dict) else {}
                if actions.get("view") and (module, "view") in perm_by_key:
                    selected_ids.append(perm_by_key[(module, "view")])
                if actions.get("edit") and (module, "edit") in perm_by_key:
                    selected_ids.append(perm_by_key[(module, "edit")])
            profile.permissions.set(selected_ids)

        clear_rbac_cache()
        return self.get(request)
