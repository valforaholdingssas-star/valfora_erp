import { useEffect, useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import timeGridPlugin from "@fullcalendar/timegrid";
import { Alert } from "react-bootstrap";
import { createActivity, fetchContacts, updateActivity, updateDeal } from "../../../api/crm.js";
import { fetchUsers } from "../../../api/users.js";
import EventDetailModal from "../components/EventDetailModal.jsx";
import CalendarSidebar from "../components/CalendarSidebar.jsx";
import CreateActivityModal from "../components/CreateActivityModal.jsx";
import { useCalendarEvents } from "../hooks/useCalendarEvents.js";

const DEFAULT_TYPES = ["activity", "deal_close", "follow_up", "whatsapp_follow_up", "stale_alert", "overdue"];

const CalendarView = () => {
  const { events, loading, error, loadEvents } = useCalendarEvents();
  const [selectedTypes, setSelectedTypes] = useState(DEFAULT_TYPES);
  const [assignedTo, setAssignedTo] = useState("");
  const [users, setUsers] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [eventDetail, setEventDetail] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [dateForCreate, setDateForCreate] = useState("");
  const [lastRange, setLastRange] = useState({ startDate: "", endDate: "" });

  useEffect(() => {
    fetchUsers({ page_size: 100 })
      .then((data) => setUsers(data.results || []))
      .catch(() => {});
    fetchContacts({ page_size: 100 })
      .then((data) => setContacts(data.results || []))
      .catch(() => {});
  }, []);

  const refreshEvents = async (range = lastRange) => {
    if (!range.startDate || !range.endDate) return;
    await loadEvents({
      ...range,
      types: selectedTypes,
      assignedTo,
    });
  };

  useEffect(() => {
    void refreshEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTypes, assignedTo]);

  const calendarEvents = useMemo(
    () =>
      (events || []).map((event) => ({
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end || undefined,
        color: event.color,
        editable:
          event.type === "activity" ||
          event.type === "overdue" ||
          event.type === "deal_close" ||
          event.type === "whatsapp_follow_up",
        extendedProps: {
          type: event.type,
          url: event.url,
          metadata: event.metadata,
        },
      })),
    [events],
  );

  return (
    <div className="app-page">
      <h1 className="h4 mb-3">Calendario</h1>
      <div className="app-chat-layout">
        <CalendarSidebar
          selectedTypes={selectedTypes}
          onChangeTypes={setSelectedTypes}
          users={users}
          assignedTo={assignedTo}
          onChangeAssignedTo={setAssignedTo}
        />
        <div className="app-chat-panel p-3" style={{ gridColumn: "span 2" }}>
          {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
            }}
            events={calendarEvents}
            editable
            selectable
            eventTimeFormat={{ hour: "2-digit", minute: "2-digit", meridiem: false }}
            loading={(isLoading) => {
              if (isLoading || loading) return;
            }}
            datesSet={(arg) => {
              const range = {
                startDate: arg.startStr.slice(0, 10),
                endDate: arg.endStr.slice(0, 10),
              };
              setLastRange(range);
              void loadEvents({
                ...range,
                types: selectedTypes,
                assignedTo,
              });
            }}
            eventClick={(info) => {
              setEventDetail({
                title: info.event.title,
                start: info.event.start?.toISOString() || "",
                type: info.event.extendedProps.type,
                url: info.event.extendedProps.url,
                metadata: info.event.extendedProps.metadata,
              });
              setShowDetail(true);
            }}
            dateClick={(info) => {
              setDateForCreate(info.dateStr);
              setShowCreateModal(true);
            }}
            eventDrop={async (info) => {
              const { event } = info;
              const type = event.extendedProps.type;
              const metadata = event.extendedProps.metadata || {};
              const nextDate = event.start ? event.start.toISOString() : null;
              try {
                if (type === "activity" || type === "overdue" || type === "whatsapp_follow_up") {
                  await updateActivity(metadata.activity_id, { due_date: nextDate });
                } else if (type === "deal_close") {
                  await updateDeal(metadata.deal_id, { expected_close_date: nextDate?.slice(0, 10) });
                } else {
                  info.revert();
                }
              } catch {
                info.revert();
              }
            }}
          />
        </div>
      </div>

      <EventDetailModal show={showDetail} eventData={eventDetail} onHide={() => setShowDetail(false)} />
      <CreateActivityModal
        show={showCreateModal}
        selectedDate={dateForCreate}
        contacts={contacts}
        onHide={() => setShowCreateModal(false)}
        onSubmit={async (payload) => {
          await createActivity(payload);
          await refreshEvents();
        }}
      />
    </div>
  );
};

export default CalendarView;
