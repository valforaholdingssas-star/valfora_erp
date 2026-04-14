import { useCallback, useState } from "react";

import { fetchCalendarEvents } from "../../../api/calendar.js";

export const useCalendarEvents = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadEvents = useCallback(async ({ startDate, endDate, types, assignedTo }) => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchCalendarEvents({
        start_date: startDate,
        end_date: endDate,
        types: types?.length ? types.join(",") : undefined,
        assigned_to: assignedTo || undefined,
      });
      setEvents(data || []);
    } catch {
      setError("No se pudieron cargar los eventos del calendario.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { events, loading, error, loadEvents };
};
