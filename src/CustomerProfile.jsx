import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, updateDoc, collection, query, where, getDocs, addDoc } from "firebase/firestore";
import { db } from "./firebase";
import {
  Container,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Box,
  Paper,
  Divider,
  List,
  ListItem,
  ListItemText,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import Swal from "sweetalert2";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import { notifyBidAppointmentScheduled } from "./pushoverNotificationService";

export default function CustomerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [linkedDocs, setLinkedDocs] = useState({
    bids: [],
    contracts: [],
    invoices: [],
    jobs: [],
  });

  // Schedule Bid Appointment dialog state
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [appointmentForm, setAppointmentForm] = useState({
    date: "",
    time: "09:00",
    notes: "",
  });

  useEffect(() => {
    const fetchCustomerAndDocs = async () => {
      try {
        const customerDoc = await getDoc(doc(db, "customers", id));
        if (customerDoc.exists()) {
          const customerData = { id: customerDoc.id, ...customerDoc.data() };
          setCustomer(customerData);

          const [bids, contracts, invoices, jobs] = await Promise.all([
            getDocs(query(collection(db, "bids"), where("customerId", "==", id))),
            getDocs(query(collection(db, "contracts"), where("customerId", "==", id))),
            getDocs(query(collection(db, "invoices"), where("customerId", "==", id))),
            getDocs(query(collection(db, "jobs"), where("customerId", "==", id))),
          ]);

          setLinkedDocs({
            bids: bids.docs.map((d) => ({ id: d.id, ...d.data() })),
            contracts: contracts.docs.map((d) => ({ id: d.id, ...d.data() })),
            invoices: invoices.docs.map((d) => ({ id: d.id, ...d.data() })),
            jobs: jobs.docs.map((d) => ({ id: d.id, ...d.data() })),
          });
        } else {
          Swal.fire("Not Found", "Customer not found.", "error");
          navigate("/customers");
        }
      } catch (error) {
        console.error("Error fetching customer:", error);
        Swal.fire("Error", "Failed to load customer.", "error");
      } finally {
        setLoading(false);
      }
    };

    fetchCustomerAndDocs();
  }, [id, navigate]);

  const handleSave = async () => {
  if (!customer.name || !customer.phone || !customer.address) {
    const missing = [];
    if (!customer.name) missing.push("Name");
    if (!customer.phone) missing.push("Phone");
    if (!customer.address) missing.push("Address");
    Swal.fire("Missing Info", `The following fields are required: ${missing.join(", ")}`, "warning");
    return;
  }

  try {
    // 📍 Geocode the address
    let geoLat = null;
    let geoLng = null;
    const fullAddress = [customer.address, customer.city, customer.state, customer.zip]
      .filter(Boolean).join(", ");

    try {
      const encoded = encodeURIComponent(fullAddress);
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`,
        { headers: { "User-Agent": "KCLManager/1.0 (Kings Canyon Landscaping)" } }
      );
      const geoData = await geoRes.json();
      if (geoData.length > 0) {
        geoLat = parseFloat(geoData[0].lat);
        geoLng = parseFloat(geoData[0].lon);
        console.log(`📍 Geocoded: ${fullAddress} → ${geoLat}, ${geoLng}`);
      } else {
        console.warn("📍 Could not geocode address:", fullAddress);
      }
    } catch (geoErr) {
      console.warn("📍 Geocoding error:", geoErr);
    }

    await updateDoc(doc(db, "customers", id), {
      name: customer.name,
      email: customer.email || "",
      phone: customer.phone || "",
      address: customer.address || "",
      notes: customer.notes || "",
      nameLower: customer.name.toLowerCase(),
      geoLat,
      geoLng,
    });
    Swal.fire("Saved!", "Customer updated successfully.", "success");
    setEditing(false);
  } catch (error) {
    Swal.fire("Error", "Failed to save changes.", "error");
  }
};

  const handleOpenScheduleDialog = () => {
    // Default to tomorrow at 9am
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split("T")[0];
    setAppointmentForm({ date: dateStr, time: "09:00", notes: "" });
    setScheduleDialogOpen(true);
  };

  const handleScheduleBidAppointment = async () => {
    if (!appointmentForm.date || !appointmentForm.time) {
      Swal.fire("Missing Info", "Please select a date and time.", "warning");
      return;
    }

    setScheduleSaving(true);
    try {
      const startDateTime = `${appointmentForm.date}T${appointmentForm.time}`;
      const startDate = new Date(startDateTime);

      // Calculate end time — default 1 hour for a bid appointment
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
      const endTime = endDate.toTimeString().slice(0, 5);

      // 1 — Create draft bid (ready to fill in on-site)
      const bidRef = await addDoc(collection(db, "bids"), {
        customerId: id,
        customerName: customer.name,
        customerEmail: customer.email || "",
        customerPhone: customer.phone || "",
        customerAddress: customer.address || "",
        amount: 0,
        description: "",
        materials: "",
        notes: appointmentForm.notes || "",
        status: "Pending Estimate",
        createdAt: new Date().toISOString(),
        hasDesignVisualization: false,
        appointmentDate: appointmentForm.date,
        appointmentTime: appointmentForm.time,
        signingToken: "",
      });

      // 2 — Create calendar schedule entry
      await addDoc(collection(db, "schedules"), {
        customerId: id,
        clientName: customer.name,
        clientPhone: customer.phone || "",
        clientAddress: customer.address || "",
        bidId: bidRef.id,
        type: "bid-appointment",
        jobDescription: `Bid Appointment — ${customer.name}`,
        startDate: appointmentForm.date,
        endDate: appointmentForm.date,
        startTime: appointmentForm.time,
        endTime: endTime,
        status: "scheduled",
        priority: "normal",
        notes: appointmentForm.notes || "",
        assignedEmployees: [],
        selectedEquipment: [],
        createdAt: new Date().toISOString(),
      });

      // 3 — Fire Pushover notification to admin
      try {
        await notifyBidAppointmentScheduled(
          customer.name,
          customer.address || "",
          appointmentForm.date,
          appointmentForm.time
        );
      } catch (e) {
        console.error("Pushover error:", e);
      }

      setScheduleDialogOpen(false);

      await Swal.fire({
        icon: "success",
        title: "Appointment Scheduled!",
        html: `
          <p><strong>${customer.name}</strong></p>
          <p>📅 ${new Date(appointmentForm.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
          <p>🕐 ${new Date(`2000-01-01T${appointmentForm.time}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}</p>
          <p>📍 ${customer.address || "No address on file"}</p>
          <p style="margin-top:12px;font-size:13px;color:#555">A draft bid and calendar entry have been created.</p>
        `,
        confirmButtonText: "View on Calendar",
        showCancelButton: true,
        cancelButtonText: "Stay Here",
        confirmButtonColor: "#1565c0",
      }).then((result) => {
        if (result.isConfirmed) navigate("/calendar");
      });

      // Refresh linked docs to show new draft bid
      const updatedBids = await getDocs(
        query(collection(db, "bids"), where("customerId", "==", id))
      );
      setLinkedDocs((prev) => ({
        ...prev,
        bids: updatedBids.docs.map((d) => ({ id: d.id, ...d.data() })),
      }));
    } catch (error) {
      console.error("Error scheduling appointment:", error);
      Swal.fire("Error", "Failed to schedule appointment.", "error");
    } finally {
      setScheduleSaving(false);
    }
  };

  if (loading) {
    return (
      <Container sx={{ mt: 4, textAlign: "center" }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading customer...
        </Typography>
      </Container>
    );
  }

  if (!customer) {
    return null;
  }

  return (
    <Container sx={{ mt: 4, mb: 6 }}>

      {/* Header row — Back + action buttons */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: "wrap", gap: 1 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate("/customers")}
        >
          Back to Customers
        </Button>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button
            variant="outlined"
            color="primary"
            startIcon={<CalendarMonthIcon />}
            onClick={handleOpenScheduleDialog}
          >
            Schedule Bid Appointment
          </Button>
          <Button
            variant="contained"
            onClick={() => navigate("/create-bid", { state: { customerId: id, customerName: customer?.name } })}
          >
            Create Bid for {customer?.name?.split(" ")[0] || "Customer"}
          </Button>
        </Box>
      </Box>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Typography variant="h5">{customer.name}</Typography>
          <Button
            variant={editing ? "contained" : "outlined"}
            onClick={() => (editing ? handleSave() : setEditing(true))}
          >
            {editing ? "Save Changes" : "Edit"}
          </Button>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {editing ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label="Name"
              value={customer.name || ""}
              onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label="Email"
              type="email"
              value={customer.email || ""}
              onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
              fullWidth
            />
            <TextField
              label="Phone"
              value={customer.phone || ""}
              onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
              fullWidth
            />
            <TextField
              label="Address"
              multiline
              rows={2}
              value={customer.address || ""}
              onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
              fullWidth
              required
              helperText="Required – needed for scheduling and GPS navigation"
            />
            <TextField
              label="Notes"
              multiline
              rows={3}
              value={customer.notes || ""}
              onChange={(e) => setCustomer({ ...customer, notes: e.target.value })}
              fullWidth
            />
            <Button variant="text" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </Box>
        ) : (
          <Box>
            {customer.email && (
              <Typography variant="body1" sx={{ mb: 1 }}>
                <strong>Email:</strong> {customer.email}
              </Typography>
            )}
            {customer.phone && (
              <Typography variant="body1" sx={{ mb: 1 }}>
                <strong>Phone:</strong> {customer.phone}
              </Typography>
            )}
            {customer.address && (
              <Typography variant="body1" sx={{ mb: 1 }}>
                <strong>Address:</strong> {customer.address}
              </Typography>
            )}
            {customer.notes && (
              <Typography variant="body1" sx={{ mb: 1 }}>
                <strong>Notes:</strong> {customer.notes}
              </Typography>
            )}
            <Typography variant="h6" sx={{ mt: 3 }}>
              Lifetime Value: ${(customer.lifetimeValue || 0).toLocaleString()}
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Service History */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Service History
        </Typography>
        <Divider sx={{ mb: 2 }} />

        {/* Bids */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: "bold", mb: 1 }}>
            Bids ({linkedDocs.bids.length})
          </Typography>
          {linkedDocs.bids.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No bids yet
            </Typography>
          ) : (
            <List dense>
              {linkedDocs.bids.map((bid) => (
                <ListItem key={bid.id} button onClick={() => navigate(`/bids`)}>
                  <ListItemText
                    primary={
                      bid.status === "Pending Estimate"
                        ? `📋 Bid Appointment — ${bid.appointmentDate || "Date TBD"} at ${
                            bid.appointmentTime
                              ? new Date(`2000-01-01T${bid.appointmentTime}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
                              : ""
                          }`
                        : `$${bid.amount || 0} - ${bid.description || "No description"}`
                    }
                    secondary={
                      <Box component="span">
                        <Chip
                          label={bid.status || "Draft"}
                          size="small"
                          color={
                            bid.status === "Accepted" ? "success" :
                            bid.status === "Sent" ? "info" :
                            bid.status === "Pending Estimate" ? "warning" :
                            "default"
                          }
                          sx={{ mr: 1 }}
                        />
                        {bid.createdAt
                          ? new Date(bid.createdAt.seconds ? bid.createdAt.seconds * 1000 : bid.createdAt).toLocaleDateString()
                          : "N/A"}
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Box>

        {/* Contracts */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: "bold", mb: 1 }}>
            Contracts ({linkedDocs.contracts.length})
          </Typography>
          {linkedDocs.contracts.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No contracts yet
            </Typography>
          ) : (
            <List dense>
              {linkedDocs.contracts.map((contract) => (
                <ListItem key={contract.id} button onClick={() => navigate(`/contract/${contract.id}`)}>
                  <ListItemText
                    primary={`$${contract.amount} - ${contract.description || "No description"}`}
                    secondary={
                      <Box component="span">
                        <Chip label={contract.status || "Pending"} size="small" sx={{ mr: 1 }} />
                        {contract.createdAt
                          ? new Date(contract.createdAt.seconds * 1000).toLocaleDateString()
                          : "N/A"}
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Box>

        {/* Invoices */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: "bold", mb: 1 }}>
            Invoices ({linkedDocs.invoices.length})
          </Typography>
          {linkedDocs.invoices.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No invoices yet
            </Typography>
          ) : (
            <List dense>
              {linkedDocs.invoices.map((invoice) => (
                <ListItem key={invoice.id} button onClick={() => navigate(`/invoice/${invoice.id}`)}>
                  <ListItemText
                    primary={`$${invoice.total || invoice.amount || 0} - ${invoice.description || "No description"}`}
                    secondary={
                      <Box component="span">
                        <Chip
                          label={invoice.status || "Pending"}
                          size="small"
                          color={invoice.status === "Paid" ? "success" : "warning"}
                          sx={{ mr: 1 }}
                        />
                        {invoice.createdAt
                          ? new Date(invoice.createdAt.seconds * 1000).toLocaleDateString()
                          : "N/A"}
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Box>

        {/* Jobs */}
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: "bold", mb: 1 }}>
            Jobs ({linkedDocs.jobs.length})
          </Typography>
          {linkedDocs.jobs.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No jobs yet
            </Typography>
          ) : (
            <List dense>
              {linkedDocs.jobs.map((job) => (
                <ListItem key={job.id} button onClick={() => navigate(`/jobs`)}>
                  <ListItemText
                    primary={job.description || "No description"}
                    secondary={
                      <Box component="span">
                        <Chip label={job.status || "Pending"} size="small" sx={{ mr: 1 }} />
                        {job.createdAt
                          ? new Date(job.createdAt.seconds * 1000).toLocaleDateString()
                          : "N/A"}
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      </Paper>

      {/* Schedule Bid Appointment Dialog */}
      <Dialog
        open={scheduleDialogOpen}
        onClose={() => setScheduleDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          📅 Schedule Bid Appointment
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            {/* Customer summary */}
            <Paper sx={{ p: 2, mb: 3, bgcolor: "#f5f5f5" }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {customer.name}
              </Typography>
              {customer.phone && (
                <Typography variant="body2">📞 {customer.phone}</Typography>
              )}
              {customer.address && (
                <Typography variant="body2">📍 {customer.address}</Typography>
              )}
            </Paper>

            <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
              <TextField
                label="Date"
                type="date"
                value={appointmentForm.date}
                onChange={(e) => setAppointmentForm({ ...appointmentForm, date: e.target.value })}
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Time"
                type="time"
                value={appointmentForm.time}
                onChange={(e) => setAppointmentForm({ ...appointmentForm, time: e.target.value })}
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
              />
            </Box>

            <TextField
              label="Notes (optional)"
              multiline
              rows={3}
              value={appointmentForm.notes}
              onChange={(e) => setAppointmentForm({ ...appointmentForm, notes: e.target.value })}
              fullWidth
              placeholder="e.g., Customer wants a patio and fire pit. Access through side gate."
            />

            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontSize: 12 }}>
              This will create a draft bid pre-filled with customer info and add a Bid Appointment to the calendar. You'll complete the bid details on-site.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button
            onClick={() => setScheduleDialogOpen(false)}
            disabled={scheduleSaving}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleScheduleBidAppointment}
            disabled={scheduleSaving}
            startIcon={scheduleSaving ? <CircularProgress size={16} /> : <CalendarMonthIcon />}
          >
            {scheduleSaving ? "Scheduling..." : "Schedule Appointment"}
          </Button>
        </DialogActions>
      </Dialog>

    </Container>
  );
}