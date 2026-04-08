import { useCallback, useEffect, useMemo, useState } from "react";

const API_BASE = "http://localhost:8080/api";
const ROLES = ["student", "teacher", "admin"];

function toIsoLocal(value) {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function toRfc3339(value) {
  return new Date(value).toISOString();
}

async function request(path, { token, method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [role, setRole] = useState(localStorage.getItem("role") || "student");
  const [facilities, setFacilities] = useState([]);
  const [myBookings, setMyBookings] = useState([]);
  const [allBookings, setAllBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [loginForm, setLoginForm] = useState({ email: "", password: "", role: "student" });
  const [registerForm, setRegisterForm] = useState({ email: "", password: "", name: "", role: "student" });
  const [facilityForm, setFacilityForm] = useState({ name: "", type: "room", capacity: 1 });
  const [bookingForm, setBookingForm] = useState({ facility_id: "", start_time: "", end_time: "" });

  const facilityMap = useMemo(
    () => Object.fromEntries(facilities.map((f) => [f.id, f.name])),
    [facilities]
  );

  useEffect(() => {
    localStorage.setItem("token", token);
    localStorage.setItem("role", role);
  }, [token, role]);

  const refreshPublic = useCallback(async () => {
    const data = await request("/facilities");
    setFacilities(data);
  }, []);

  const refreshPrivate = useCallback(async () => {
    if (!token) return;
    const [mine, all] = await Promise.all([
      request("/bookings/me", { token }).catch(() => []),
      request("/bookings", { token }).catch(() => []),
    ]);
    setMyBookings(mine);
    setAllBookings(Array.isArray(all) ? all : []);
  }, [token]);

  useEffect(() => {
    refreshPublic().catch((e) => setMessage(e.message));
    if (token) refreshPrivate().catch((e) => setMessage(e.message));
  }, [refreshPublic, refreshPrivate, token]);

  async function onLogin(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const data = await request("/login", { method: "POST", body: { email: loginForm.email, password: loginForm.password } });
      setToken(data.token);
      setRole(loginForm.role);
      setMessage("Login successful.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function onRegister(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      await request("/register", { method: "POST", body: registerForm });
      setMessage("Registration successful. You can now login.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function onLogout() {
    setLoading(true);
    try {
      await request("/logout", { token, method: "POST" });
    } catch {
      // Continue local logout even if API logout fails.
    } finally {
      setToken("");
      setMyBookings([]);
      setAllBookings([]);
      setLoading(false);
      setMessage("Logged out.");
    }
  }

  async function onCreateFacility(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      await request("/facilities", { token, method: "POST", body: { ...facilityForm, capacity: Number(facilityForm.capacity) } });
      setFacilityForm({ name: "", type: "room", capacity: 1 });
      await refreshPublic();
      setMessage("Facility created.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function onCreateBooking(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      await request("/bookings", {
        token,
        method: "POST",
        body: {
          facility_id: bookingForm.facility_id,
          start_time: toRfc3339(bookingForm.start_time),
          end_time: toRfc3339(bookingForm.end_time),
        },
      });
      await refreshPrivate();
      setMessage("Booking created.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function onCancelBooking(id) {
    setLoading(true);
    try {
      await request(`/bookings/${id}`, { token, method: "DELETE" });
      await refreshPrivate();
      setMessage("Booking cancelled.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function onApproveBooking(id) {
    setLoading(true);
    try {
      await request(`/bookings/${id}/approve`, { token, method: "PUT" });
      await refreshPrivate();
      setMessage("Booking approved.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <header>
        <h1>Campus Facilities Reservation</h1>
        <p>Frontend for the Go/Gin campus booking API</p>
      </header>

      {message && <div className="msg">{message}</div>}

      {!token ? (
        <div className="grid">
          <section className="card">
            <h2>Login</h2>
            <form onSubmit={onLogin}>
              <input placeholder="Email" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} required />
              <input placeholder="Password" type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} required />
              <label>Role (for UI access)</label>
              <select value={loginForm.role} onChange={(e) => setLoginForm({ ...loginForm, role: e.target.value })}>
                {ROLES.map((r) => <option key={r}>{r}</option>)}
              </select>
              <button disabled={loading}>Login</button>
            </form>
          </section>

          <section className="card">
            <h2>Register</h2>
            <form onSubmit={onRegister}>
              <input placeholder="Name" value={registerForm.name} onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })} />
              <input placeholder="Email" value={registerForm.email} onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })} required />
              <input placeholder="Password (min 6)" type="password" value={registerForm.password} onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })} required />
              <select value={registerForm.role} onChange={(e) => setRegisterForm({ ...registerForm, role: e.target.value })}>
                {ROLES.map((r) => <option key={r}>{r}</option>)}
              </select>
              <button disabled={loading}>Register</button>
            </form>
          </section>
        </div>
      ) : (
        <>
          <div className="toolbar">
            <span>Signed in as: <strong>{role}</strong></span>
            <button onClick={onLogout} disabled={loading}>Logout</button>
          </div>

          <div className="grid">
            <section className="card">
              <h2>Facilities</h2>
              <ul>
                {facilities.map((f) => (
                  <li key={f.id}>
                    <strong>{f.name}</strong> ({f.type}) - capacity {f.capacity} - {f.status}
                  </li>
                ))}
              </ul>
            </section>

            <section className="card">
              <h2>Create Booking</h2>
              <form onSubmit={onCreateBooking}>
                <select value={bookingForm.facility_id} onChange={(e) => setBookingForm({ ...bookingForm, facility_id: e.target.value })} required>
                  <option value="">Select facility</option>
                  {facilities.map((f) => (
                    <option key={f.id} value={f.id}>{f.name} ({f.type})</option>
                  ))}
                </select>
                <label>Start</label>
                <input type="datetime-local" value={bookingForm.start_time} onChange={(e) => setBookingForm({ ...bookingForm, start_time: e.target.value })} required />
                <label>End</label>
                <input type="datetime-local" value={bookingForm.end_time} onChange={(e) => setBookingForm({ ...bookingForm, end_time: e.target.value })} required />
                <button disabled={loading}>Book</button>
              </form>
            </section>

            {(role === "admin" || role === "teacher") && (
              <section className="card">
                <h2>All Bookings (approve)</h2>
                <ul>
                  {allBookings.map((b) => (
                    <li key={b.id}>
                      {facilityMap[b.facility_id] || b.facility_id} | {toIsoLocal(b.start_time)} to {toIsoLocal(b.end_time)} | {b.status}
                      <div className="actions">
                        <button onClick={() => onApproveBooking(b.id)} disabled={loading || b.status === "approved"}>Approve</button>
                        {(role === "admin") && (
                          <button className="danger" onClick={() => onCancelBooking(b.id)} disabled={loading}>Cancel</button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {role === "admin" && (
              <section className="card">
                <h2>Create Facility (admin)</h2>
                <form onSubmit={onCreateFacility}>
                  <input placeholder="Name" value={facilityForm.name} onChange={(e) => setFacilityForm({ ...facilityForm, name: e.target.value })} required />
                  <select value={facilityForm.type} onChange={(e) => setFacilityForm({ ...facilityForm, type: e.target.value })}>
                    <option value="room">room</option>
                    <option value="lab">lab</option>
                    <option value="equipment">equipment</option>
                  </select>
                  <input type="number" min="1" value={facilityForm.capacity} onChange={(e) => setFacilityForm({ ...facilityForm, capacity: e.target.value })} required />
                  <button disabled={loading}>Create</button>
                </form>
              </section>
            )}

            <section className="card">
              <h2>My Bookings</h2>
              <ul>
                {myBookings.map((b) => (
                  <li key={b.id}>
                    {facilityMap[b.facility_id] || b.facility_id} | {toIsoLocal(b.start_time)} to {toIsoLocal(b.end_time)} | {b.status}
                    <div className="actions">
                      <button className="danger" onClick={() => onCancelBooking(b.id)} disabled={loading}>Cancel</button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
