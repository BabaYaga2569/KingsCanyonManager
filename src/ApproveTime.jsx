import React, { useState, useEffect } from "react";
import { collection, getDocs, getDoc, query, where, updateDoc, doc, deleteDoc, addDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./AuthProvider";
import {
  Container,
  Typography,
  Box,
  Paper,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Card,
  CardContent,
  Chip,
  Grid,
  IconButton,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useMediaQuery,
  useTheme,
  MenuItem,
  Divider,
  Alert,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import GpsFixedIcon from "@mui/icons-material/GpsFixed";
import DownloadIcon from "@mui/icons-material/Download";
import AddIcon from "@mui/icons-material/Add";
import PersonAddAltIcon from "@mui/icons-material/PersonAddAlt";
import LogoutIcon from "@mui/icons-material/Logout";
import Tooltip from "@mui/material/Tooltip";
import { exportTimeEntriesToExcel, exportTimeEntriesToCSV } from "./utils/kclExportUtils";
import moment from "moment";
import Swal from "sweetalert2";

function GpsBadge({ entry }) {
  if (entry.manualEntry) {
    return (
      <Tooltip title={entry.manualEntryReason || "Manual admin-entered time"}>
        <Chip
          label={entry.manualClockInOnly ? "Manual Clock-In" : "Manual Entry"}
          size="small"
          sx={{
            backgroundColor: "#e3f2fd",
            color: "#1565c0",
            fontWeight: "bold",
            border: "1px solid #90caf9",
          }}
        />
      </Tooltip>
    );
  }

  if (entry.gpsDistanceFeet == null) {
    return (
      <Tooltip title="No GPS data recorded">
        <Chip
          icon={<GpsFixedIcon />}
          label="No GPS"
          size="small"
          sx={{
            backgroundColor: "#f5f5f5",
            color: "#9e9e9e",
            fontWeight: "bold",
          }}
        />
      </Tooltip>
    );
  }

  const onSite = entry.gpsDistanceFeet <= 500;
  const label = onSite
    ? `✅ ${entry.gpsDistanceFeet} ft`
    : `⚠️ ${entry.gpsDistanceFeet.toLocaleString()} ft`;

  const tooltipText = `${onSite ? "ON SITE" : "OFF SITE"} — ${entry.gpsDistanceFeet.toLocaleString()} ft (${entry.gpsDistanceMiles} mi)${
    entry.jobAddress ? `\n📍 ${entry.jobAddress}` : ""
  }`;

  return (
    <Tooltip title={tooltipText}>
      <Chip
        icon={<GpsFixedIcon />}
        label={label}
        size="small"
        sx={{
          backgroundColor: onSite ? "#e8f5e9" : "#fff3e0",
          color: onSite ? "#2e7d32" : "#e65100",
          fontWeight: "bold",
          border: `1px solid ${onSite ? "#a5d6a7" : "#ffcc80"}`,
        }}
      />
    </Tooltip>
  );
}

function TimeEntriesTable({
  entries,
  onApprove,
  onReject,
  onEdit,
  onDelete,
  onClockOutNow,
  title,
  emptyMessage,
}) {
  return (
    <Paper sx={{ mb: 3 }}>
      <Box
        sx={{
          p: 2,
          borderBottom: "1px solid #e0e0e0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        <Typography variant="h6">{title}</Typography>
      </Box>

      {entries.length === 0 ? (
        <Box sx={{ p: 4, textAlign: "center" }}>
          <Typography color="text.secondary" variant="h6">
            {emptyMessage}
          </Typography>
        </Box>
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: "#f5f5f5" }}>
                <TableCell>Crew Member</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Job</TableCell>
                <TableCell>Clock In</TableCell>
                <TableCell>Clock Out</TableCell>
                <TableCell>Hours</TableCell>
                <TableCell>Lunch Break</TableCell>
                <TableCell>📍 GPS</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{entry.crewName}</TableCell>
                  <TableCell>{moment(entry.clockIn).format("MMM D, YYYY")}</TableCell>
                  <TableCell>{entry.jobName}</TableCell>
                  <TableCell>{moment(entry.clockIn).format("h:mm A")}</TableCell>
                  <TableCell>{entry.clockOut ? moment(entry.clockOut).format("h:mm A") : "Open"}</TableCell>
                  <TableCell>
                    <Typography fontWeight="bold" color="primary">
                      {entry.hoursWorked != null ? `${entry.hoursWorked}h` : "Open"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {entry.lunchMinutes > 0 ? (
                      <Box>
                        <Typography variant="body2" color="warning.dark" fontWeight="bold">
                          🍔 {entry.lunchMinutes} min
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {entry.lunchStartTime ? moment(entry.lunchStartTime).format("h:mm A") : "?"} – {entry.lunchEndTime ? moment(entry.lunchEndTime).format("h:mm A") : "?"}
                        </Typography>
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.disabled">
                        🚫 None
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <GpsBadge entry={entry} />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                      {onApprove && (
                        <IconButton size="small" color="success" onClick={() => onApprove(entry)} title="Approve">
                          <CheckCircleIcon />
                        </IconButton>
                      )}
                      {onReject && (
                        <IconButton size="small" color="error" onClick={() => onReject(entry)} title="Reject">
                          <CancelIcon />
                        </IconButton>
                      )}
                      {onClockOutNow && !entry.clockOut && (
                        <IconButton
                          size="small"
                          color="warning"
                          onClick={() => onClockOutNow(entry)}
                          title="Clock Out Now"
                        >
                          <LogoutIcon />
                        </IconButton>
                      )}
                      <IconButton size="small" color="info" onClick={() => onEdit(entry)} title="Edit">
                        <EditIcon />
                      </IconButton>
                      <IconButton size="small" onClick={() => onDelete(entry)} title="Delete">
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
}

export default function ApproveTime() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [timeEntries, setTimeEntries] = useState([]);
  const [openManualEntries, setOpenManualEntries] = useState([]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [editForm, setEditForm] = useState({});

  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [manualForm, setManualForm] = useState({
    crewId: "",
    crewName: "",
    crewEmail: "",
    jobId: "",
    jobName: "",
    date: moment().format("YYYY-MM-DD"),
    clockInTime: "",
    clockOutTime: "",
    lunchMinutes: 0,
    reason: "GPS issue / admin manual entry",
  });

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    await Promise.all([loadTimeEntries(), loadOpenManualEntries(), loadManualFormData()]);
    setLoading(false);
  };

  const loadTimeEntries = async () => {
    try {
      const qPending = query(collection(db, "job_time_entries"), where("status", "==", "pending"));
      const snap = await getDocs(qPending);
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => new Date(b.clockIn) - new Date(a.clockIn));
      setTimeEntries(data);
    } catch (error) {
      console.error("Error loading time entries:", error);
    }
  };

  const loadOpenManualEntries = async () => {
    try {
      const qManualOpen = query(
        collection(db, "job_time_entries"),
        where("manualEntry", "==", true),
        where("clockOut", "==", null)
      );
      const snap = await getDocs(qManualOpen);
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => new Date(b.clockIn) - new Date(a.clockIn));
      setOpenManualEntries(data);
    } catch (error) {
      console.error("Error loading open manual entries:", error);
    }
  };

  const loadManualFormData = async () => {
    try {
      const [usersSnap, jobsSnap] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "jobs")),
      ]);

      const employeeUsers = usersSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((u) => u.email && (u.role === "crew" || u.role === "admin" || u.role === "god"))
        .sort((a, b) =>
          (a.name || a.displayName || a.email || "").localeCompare(
            b.name || b.displayName || b.email || ""
          )
        );

      const jobsData = jobsSnap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            displayName: data.clientName || data.customerName || data.jobName || "Unknown Job",
          };
        })
        .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));

      setEmployees(employeeUsers);
      setJobs(jobsData);
    } catch (error) {
      console.error("Error loading manual form data:", error);
    }
  };

  const resetManualForm = () => {
    setManualForm({
      crewId: "",
      crewName: "",
      crewEmail: "",
      jobId: "",
      jobName: "",
      date: moment().format("YYYY-MM-DD"),
      clockInTime: "",
      clockOutTime: "",
      lunchMinutes: 0,
      reason: "GPS issue / admin manual entry",
    });
  };

  const handleApprove = async (entry) => {
    try {
      await updateDoc(doc(db, "job_time_entries", entry.id), {
        status: "approved",
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await loadAllData();

      Swal.fire({
        icon: "success",
        title: "Approved!",
        text: `${entry.crewName}'s ${entry.hoursWorked}h has been approved`,
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error("Error approving time entry:", error);
      Swal.fire("Error", "Failed to approve time entry", "error");
    }
  };

  const handleReject = async (entry) => {
    const result = await Swal.fire({
      title: "Reject Time Entry?",
      html: `
        <p>${entry.crewName} - ${entry.hoursWorked != null ? `${entry.hoursWorked}h` : "Open"}</p>
        <p>${moment(entry.clockIn).format("MMM D, h:mm A")} - ${entry.clockOut ? moment(entry.clockOut).format("h:mm A") : "Open"}</p>
      `,
      input: "text",
      inputLabel: "Reason for rejection",
      inputPlaceholder: "Enter reason...",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d32f2f",
      confirmButtonText: "Reject",
      inputValidator: (value) => {
        if (!value) return "Please enter a reason";
      },
    });

    if (result.isConfirmed) {
      try {
        await updateDoc(doc(db, "job_time_entries", entry.id), {
          status: "rejected",
          rejectionReason: result.value,
          rejectedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        await loadAllData();
        Swal.fire("Rejected", "Time entry has been rejected", "success");
      } catch (error) {
        console.error("Error rejecting time entry:", error);
        Swal.fire("Error", "Failed to reject time entry", "error");
      }
    }
  };

  const handleEditClick = (entry) => {
    setEditingEntry(entry);
    setEditForm({
      clockIn: moment(entry.clockIn).format("YYYY-MM-DDTHH:mm"),
      clockOut: entry.clockOut ? moment(entry.clockOut).format("YYYY-MM-DDTHH:mm") : "",
      hoursWorked: entry.hoursWorked || "",
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    try {
      const clockIn = moment(editForm.clockIn).toISOString();
      const clockOut = editForm.clockOut ? moment(editForm.clockOut).toISOString() : null;

      let hours = parseFloat(editForm.hoursWorked);
      if (clockOut) {
        const duration = moment(clockOut).diff(moment(clockIn), "hours", true);
        hours = parseFloat(duration.toFixed(2));
      }

      await updateDoc(doc(db, "job_time_entries", editingEntry.id), {
        clockIn,
        clockOut,
        hoursWorked: clockOut ? hours : null,
        updatedAt: new Date().toISOString(),
        manualClockInOnly: !clockOut,
      });

      setEditDialogOpen(false);
      await loadAllData();
      Swal.fire("Success", "Time entry updated", "success");
    } catch (error) {
      console.error("Error updating time entry:", error);
      Swal.fire("Error", "Failed to update time entry", "error");
    }
  };

  const handleDelete = async (entry) => {
    const result = await Swal.fire({
      title: "Delete Time Entry?",
      html: `
        <p>${entry.crewName} - ${entry.hoursWorked != null ? `${entry.hoursWorked}h` : "Open"}</p>
        <p>${moment(entry.clockIn).format("MMM D, YYYY")}</p>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d32f2f",
      confirmButtonText: "Delete",
    });

    if (result.isConfirmed) {
      try {
        await deleteDoc(doc(db, "job_time_entries", entry.id));
        await loadAllData();
        Swal.fire("Deleted", "Time entry has been deleted", "success");
      } catch (error) {
        console.error("Error deleting time entry:", error);
        Swal.fire("Error", "Failed to delete time entry", "error");
      }
    }
  };

  const handleClockOutNow = async (entry) => {
    const now = moment();
    const result = await Swal.fire({
      title: "Clock Out Now?",
      html: `
        <div style="text-align:left">
          <p><strong>${entry.crewName}</strong></p>
          <p>Job: ${entry.jobName || "Unknown Job"}</p>
          <p>Clock In: ${moment(entry.clockIn).format("MMM D, YYYY h:mm A")}</p>
          <p>Clock Out: ${now.format("MMM D, YYYY h:mm A")}</p>
        </div>
      `,
      input: "number",
      inputLabel: "Lunch minutes",
      inputValue: entry.lunchMinutes || 0,
      inputAttributes: {
        min: 0,
        step: 1,
      },
      showCancelButton: true,
      confirmButtonText: "Clock Out Now",
      confirmButtonColor: "#ed6c02",
      inputValidator: (value) => {
        if (value === "" || value == null) return;
        if (Number(value) < 0) return "Lunch minutes cannot be negative";
      },
    });

    if (!result.isConfirmed) return;

    try {
      const lunchMinutes = parseFloat(result.value) || 0;
      const clockOutIso = now.toISOString();
      const totalHours = now.diff(moment(entry.clockIn), "hours", true);
      const workedHours = parseFloat((totalHours - lunchMinutes / 60).toFixed(2));

      if (workedHours < 0) {
        Swal.fire("Invalid Hours", "Lunch time cannot exceed total worked time.", "warning");
        return;
      }

      await updateDoc(doc(db, "job_time_entries", entry.id), {
        clockOut: clockOutIso,
        hoursWorked: workedHours,
        lunchMinutes,
        lunchEndTime: lunchMinutes > 0 ? clockOutIso : null,
        updatedAt: new Date().toISOString(),
        manualClockInOnly: false,
      });

      await loadAllData();

      Swal.fire({
        icon: "success",
        title: "Clocked Out",
        text: `${entry.crewName} was clocked out with ${workedHours} worked hours.`,
      });
    } catch (error) {
      console.error("Error clocking out manual entry:", error);
      Swal.fire("Error", "Failed to clock out entry", "error");
    }
  };

  const handleManualEmployeeChange = (employeeId) => {
    const employee = employees.find((e) => e.id === employeeId);
    setManualForm((prev) => ({
      ...prev,
      crewId: employee?.id || "",
      crewName: employee?.name || employee?.displayName || employee?.email || "",
      crewEmail: employee?.email || "",
    }));
  };

  const handleManualJobChange = (jobId) => {
    const job = jobs.find((j) => j.id === jobId);
    setManualForm((prev) => ({
      ...prev,
      jobId: job?.id || "",
      jobName: job?.displayName || "",
    }));
  };

  const handleSaveManualTime = async () => {
    try {
      if (!manualForm.crewId || !manualForm.jobId || !manualForm.date || !manualForm.clockInTime) {
        Swal.fire("Missing Info", "Please fill out employee, job, date, and clock in time.", "warning");
        return;
      }

      const existingOpenQuery = query(
        collection(db, "job_time_entries"),
        where("crewId", "==", manualForm.crewId),
        where("clockOut", "==", null)
      );
      const existingOpenSnap = await getDocs(existingOpenQuery);

      if (!existingOpenSnap.empty) {
        Swal.fire(
          "Already Clocked In",
          `${manualForm.crewName} already has an open time entry. Please clock them out or edit the existing one first.`,
          "warning"
        );
        return;
      }

      const clockIn = moment(`${manualForm.date}T${manualForm.clockInTime}`).toISOString();
      const hasClockOut = !!manualForm.clockOutTime;
      const clockOut = hasClockOut
        ? moment(`${manualForm.date}T${manualForm.clockOutTime}`).toISOString()
        : null;

      if (clockOut && !moment(clockOut).isAfter(moment(clockIn))) {
        Swal.fire("Invalid Time", "Clock out must be after clock in.", "warning");
        return;
      }

      let hoursWorked = null;
      let lunchMinutes = 0;

      if (clockOut) {
        lunchMinutes = parseFloat(manualForm.lunchMinutes) || 0;
        const totalHours = moment(clockOut).diff(moment(clockIn), "hours", true);
        const lunchHours = lunchMinutes / 60;
        hoursWorked = parseFloat((totalHours - lunchHours).toFixed(2));

        if (hoursWorked < 0) {
          Swal.fire("Invalid Hours", "Lunch time cannot exceed total worked time.", "warning");
          return;
        }
      }

      const selectedJob = jobs.find((j) => j.id === manualForm.jobId);

      let jobAddress = null;
      let gpsJobLat = null;
      let gpsJobLng = null;

      if (selectedJob?.customerId) {
        try {
          const customerSnap = await getDoc(doc(db, "customers", selectedJob.customerId));
          if (customerSnap.exists()) {
            const customerData = customerSnap.data();

            const addressParts = [
              customerData.address,
              customerData.city,
              customerData.state,
              customerData.zip,
            ].filter(Boolean);

            if (addressParts.length > 0) {
              jobAddress = addressParts.join(", ");
            }

            gpsJobLat = customerData.geoLat || null;
            gpsJobLng = customerData.geoLng || null;
          }
        } catch (customerError) {
          console.error("Error loading customer GPS/address for manual time entry:", customerError);
        }
      }

      const entryData = {
        crewId: manualForm.crewId,
        crewName: manualForm.crewName,
        crewEmail: manualForm.crewEmail,
        jobId: manualForm.jobId,
        jobName: manualForm.jobName,
        jobDescription: selectedJob?.displayName || manualForm.jobName,
        clockIn,
        clockOut,
        hoursWorked,
        lunchMinutes,
        lunchStartTime: null,
        lunchEndTime: null,
        status: "approved",
        manualEntry: true,
        manualClockInOnly: !clockOut,
        manualEntryReason: manualForm.reason || "Admin manual entry",
        approvedAt: new Date().toISOString(),
        approvedBy: user?.email || "admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: user?.email || "admin",
        createdByRole: "admin",
        gpsSkipped: true,
        gpsSkipReason: "manual_entry",
        jobAddress,
        gpsJobLat,
        gpsJobLng,
      };

      await addDoc(collection(db, "job_time_entries"), entryData);

      setManualDialogOpen(false);
      resetManualForm();
      await loadAllData();

      Swal.fire({
        icon: "success",
        title: clockOut ? "Manual Time Added" : "Manual Clock-In Added",
        text: clockOut
          ? `${entryData.crewName} was credited ${hoursWorked} hours and marked approved.`
          : `${entryData.crewName} is now clocked in and can clock out later from their device.`,
      });
    } catch (error) {
      console.error("Error adding manual time:", error);
      Swal.fire("Error", "Failed to add manual time entry", "error");
    }
  };

  if (loading) {
    return (
      <Container sx={{ mt: 4, textAlign: "center" }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Loading time entries...</Typography>
      </Container>
    );
  }

  const totalPendingHours = timeEntries.reduce((sum, e) => sum + (parseFloat(e.hoursWorked) || 0), 0);

  return (
    <Container sx={{ mt: 3, pb: 4 }}>
      <Typography variant="h4" gutterBottom>
        ⏳ Approve Time Entries
      </Typography>

      <Card sx={{ mb: 3, backgroundColor: "#fff3e0" }}>
        <CardContent>
          <Typography variant="h6" color="warning.main" gutterBottom>
            Pending Approval
          </Typography>
          <Typography variant="h3" color="warning.main">
            {totalPendingHours.toFixed(1)}h
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {timeEntries.length} pending · {openManualEntries.length} open manual clock-ins
          </Typography>
        </CardContent>
      </Card>

      <Paper sx={{ mb: 3 }}>
        <Box
          sx={{
            p: 2,
            borderBottom: "1px solid #e0e0e0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
          }}
        >
          <Typography variant="h6">Time Tools</Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button
              variant="contained"
              size="small"
              startIcon={<PersonAddAltIcon />}
              onClick={() => setManualDialogOpen(true)}
            >
              Add Manual Time
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<DownloadIcon />}
              onClick={() => exportTimeEntriesToExcel(timeEntries)}
            >
              Excel
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<DownloadIcon />}
              onClick={() => exportTimeEntriesToCSV(timeEntries)}
            >
              CSV
            </Button>
          </Box>
        </Box>
      </Paper>

      {!isMobile ? (
        <>
          <TimeEntriesTable
            entries={timeEntries}
            onApprove={handleApprove}
            onReject={handleReject}
            onEdit={handleEditClick}
            onDelete={handleDelete}
            title="Pending Time Entries"
            emptyMessage="✅ No pending entries."
          />

          <TimeEntriesTable
            entries={openManualEntries}
            onEdit={handleEditClick}
            onDelete={handleDelete}
            onClockOutNow={handleClockOutNow}
            title="Open Manual Clock-Ins"
            emptyMessage="No open manual clock-ins."
          />
        </>
      ) : (
        <>
          <Paper sx={{ mb: 3 }}>
            <Box sx={{ p: 2, borderBottom: "1px solid #e0e0e0" }}>
              <Typography variant="h6">Pending Time Entries</Typography>
            </Box>
            {timeEntries.length === 0 ? (
              <Box sx={{ p: 4, textAlign: "center" }}>
                <Typography color="text.secondary" variant="h6">
                  ✅ No pending entries.
                </Typography>
              </Box>
            ) : (
              <Box sx={{ p: 2 }}>
                {timeEntries.map((entry) => (
                  <Card key={entry.id} sx={{ mb: 2 }}>
                    <CardContent>
                      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                        <Typography variant="h6">{entry.crewName}</Typography>
                        <Typography variant="h6" color="primary">
                          {entry.hoursWorked != null ? `${entry.hoursWorked}h` : "Open"}
                        </Typography>
                      </Box>

                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        {entry.jobName}
                      </Typography>

                      <Typography variant="body2">
                        {moment(entry.clockIn).format("ddd, MMM D, YYYY")}
                      </Typography>

                      <Typography variant="body2">
                        {moment(entry.clockIn).format("h:mm A")} - {entry.clockOut ? moment(entry.clockOut).format("h:mm A") : "Open"}
                      </Typography>

                      <Box sx={{ mt: 1 }}>
                        <GpsBadge entry={entry} />
                      </Box>

                      <Box sx={{ mt: 2, display: "flex", gap: 1, flexWrap: "wrap" }}>
                        <Button size="small" variant="contained" color="success" startIcon={<CheckCircleIcon />} onClick={() => handleApprove(entry)} fullWidth>
                          Approve
                        </Button>
                        <Button size="small" variant="outlined" color="error" startIcon={<CancelIcon />} onClick={() => handleReject(entry)} fullWidth>
                          Reject
                        </Button>
                        <Button size="small" variant="outlined" color="info" startIcon={<EditIcon />} onClick={() => handleEditClick(entry)} fullWidth>
                          Edit
                        </Button>
                      </Box>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            )}
          </Paper>

          <Paper sx={{ mb: 3 }}>
            <Box sx={{ p: 2, borderBottom: "1px solid #e0e0e0" }}>
              <Typography variant="h6">Open Manual Clock-Ins</Typography>
            </Box>
            {openManualEntries.length === 0 ? (
              <Box sx={{ p: 4, textAlign: "center" }}>
                <Typography color="text.secondary" variant="h6">
                  No open manual clock-ins.
                </Typography>
              </Box>
            ) : (
              <Box sx={{ p: 2 }}>
                {openManualEntries.map((entry) => (
                  <Card key={entry.id} sx={{ mb: 2 }}>
                    <CardContent>
                      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                        <Typography variant="h6">{entry.crewName}</Typography>
                        <Typography variant="h6" color="primary">
                          Open
                        </Typography>
                      </Box>

                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        {entry.jobName}
                      </Typography>

                      <Typography variant="body2">
                        {moment(entry.clockIn).format("ddd, MMM D, YYYY")}
                      </Typography>

                      <Typography variant="body2">
                        {moment(entry.clockIn).format("h:mm A")} - Open
                      </Typography>

                      <Box sx={{ mt: 1 }}>
                        <GpsBadge entry={entry} />
                      </Box>

                      <Box sx={{ mt: 2, display: "flex", gap: 1, flexWrap: "wrap" }}>
                        <Button
                          size="small"
                          variant="contained"
                          color="warning"
                          startIcon={<LogoutIcon />}
                          onClick={() => handleClockOutNow(entry)}
                          fullWidth
                        >
                          Clock Out Now
                        </Button>
                        <Button size="small" variant="outlined" color="info" startIcon={<EditIcon />} onClick={() => handleEditClick(entry)} fullWidth>
                          Edit
                        </Button>
                        <Button size="small" variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => handleDelete(entry)} fullWidth>
                          Delete
                        </Button>
                      </Box>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            )}
          </Paper>
        </>
      )}

      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Time Entry</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                label="Clock In"
                type="datetime-local"
                value={editForm.clockIn || ""}
                onChange={(e) => setEditForm({ ...editForm, clockIn: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Clock Out"
                type="datetime-local"
                value={editForm.clockOut || ""}
                onChange={(e) => setEditForm({ ...editForm, clockOut: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
                helperText="Leave blank if the entry should stay open"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Hours Worked"
                type="number"
                value={editForm.hoursWorked || ""}
                onChange={(e) => setEditForm({ ...editForm, hoursWorked: e.target.value })}
                fullWidth
                inputProps={{ min: 0, step: 0.5 }}
                helperText="Used when Clock Out is filled in"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button onClick={handleSaveEdit} variant="contained" color="primary">
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={manualDialogOpen} onClose={() => setManualDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Manual Time Entry</DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }}>
            You can leave <strong>Clock Out Time</strong> blank if the employee is still working.
            They should then see the normal <strong>Clock Out</strong> option on their device later.
          </Alert>

          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                select
                label="Employee"
                value={manualForm.crewId}
                onChange={(e) => handleManualEmployeeChange(e.target.value)}
                fullWidth
              >
                {employees.map((employee) => (
                  <MenuItem key={employee.id} value={employee.id}>
                    {employee.name || employee.displayName || employee.email}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12}>
              <TextField
                select
                label="Job"
                value={manualForm.jobId}
                onChange={(e) => handleManualJobChange(e.target.value)}
                fullWidth
              >
                {jobs.map((job) => (
                  <MenuItem key={job.id} value={job.id}>
                    {job.displayName}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 0.5 }} />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                label="Date"
                type="date"
                value={manualForm.date}
                onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                label="Lunch Minutes"
                type="number"
                value={manualForm.lunchMinutes}
                onChange={(e) => setManualForm({ ...manualForm, lunchMinutes: e.target.value })}
                fullWidth
                inputProps={{ min: 0, step: 1 }}
                helperText="Only used if Clock Out Time is filled in"
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                label="Clock In Time"
                type="time"
                value={manualForm.clockInTime}
                onChange={(e) => setManualForm({ ...manualForm, clockInTime: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                label="Clock Out Time (optional)"
                type="time"
                value={manualForm.clockOutTime}
                onChange={(e) => setManualForm({ ...manualForm, clockOutTime: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
                helperText="Leave blank if employee is still working"
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                label="Reason / Note"
                value={manualForm.reason}
                onChange={(e) => setManualForm({ ...manualForm, reason: e.target.value })}
                fullWidth
                multiline
                minRows={2}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setManualDialogOpen(false);
              resetManualForm();
            }}
            color="inherit"
          >
            Cancel
          </Button>
          <Button onClick={handleSaveManualTime} variant="contained" startIcon={<AddIcon />}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}