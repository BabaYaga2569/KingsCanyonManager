import React, { useState, useEffect } from "react";
import { collection, getDocs, query, where, updateDoc, doc, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";
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
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import GpsFixedIcon from "@mui/icons-material/GpsFixed";
import Tooltip from "@mui/material/Tooltip";
import moment from "moment";
import Swal from "sweetalert2";

// 📍 GPS Badge component for time entries
function GpsBadge({ entry }) {
  if (entry.gpsDistanceFeet == null) {
    return (
      <Tooltip title="No GPS data recorded">
        <Chip
          icon={<GpsFixedIcon />}
          label="No GPS"
          size="small"
          sx={{ backgroundColor: '#f5f5f5', color: '#9e9e9e', fontWeight: 'bold' }}
        />
      </Tooltip>
    );
  }

  const onSite = entry.gpsDistanceFeet <= 500;
  const label = onSite
    ? `✅ ${entry.gpsDistanceFeet} ft`
    : `⚠️ ${entry.gpsDistanceFeet.toLocaleString()} ft`;
  const tooltipText = `${onSite ? "ON SITE" : "OFF SITE"} — ${entry.gpsDistanceFeet.toLocaleString()} ft (${entry.gpsDistanceMiles} mi)${entry.jobAddress ? `\n📍 ${entry.jobAddress}` : ""}`;

  return (
    <Tooltip title={tooltipText}>
      <Chip
        icon={<GpsFixedIcon />}
        label={label}
        size="small"
        sx={{
          backgroundColor: onSite ? '#e8f5e9' : '#fff3e0',
          color: onSite ? '#2e7d32' : '#e65100',
          fontWeight: 'bold',
          border: `1px solid ${onSite ? '#a5d6a7' : '#ffcc80'}`,
        }}
      />
    </Tooltip>
  );
}

export default function ApproveTime() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [loading, setLoading] = useState(true);
  const [timeEntries, setTimeEntries] = useState([]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    loadTimeEntries();
  }, []);

  const loadTimeEntries = async () => {
    try {
      const timeEntriesRef = collection(db, "job_time_entries");
      const q = query(timeEntriesRef, where("status", "==", "pending"));
      
      const entriesSnap = await getDocs(q);
      const entriesData = entriesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      
      // Sort by most recent first
      entriesData.sort((a, b) => new Date(b.clockIn) - new Date(a.clockIn));
      
      setTimeEntries(entriesData);
      setLoading(false);
    } catch (error) {
      console.error("Error loading time entries:", error);
      setLoading(false);
    }
  };

  const handleApprove = async (entry) => {
    try {
      await updateDoc(doc(db, "job_time_entries", entry.id), {
        status: "approved",
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      setTimeEntries(timeEntries.filter(e => e.id !== entry.id));

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
        <p>${entry.crewName} - ${entry.hoursWorked}h</p>
        <p>${moment(entry.clockIn).format('MMM D, h:mm A')} - ${moment(entry.clockOut).format('h:mm A')}</p>
      `,
      input: "text",
      inputLabel: "Reason for rejection",
      inputPlaceholder: "Enter reason...",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d32f2f",
      confirmButtonText: "Reject",
      inputValidator: (value) => {
        if (!value) {
          return "Please enter a reason";
        }
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

        setTimeEntries(timeEntries.filter(e => e.id !== entry.id));

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
      clockIn: moment(entry.clockIn).format('YYYY-MM-DDTHH:mm'),
      clockOut: entry.clockOut ? moment(entry.clockOut).format('YYYY-MM-DDTHH:mm') : '',
      hoursWorked: entry.hoursWorked || '',
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    try {
      const clockIn = moment(editForm.clockIn).toISOString();
      const clockOut = editForm.clockOut ? moment(editForm.clockOut).toISOString() : null;
      
      // Calculate hours
      let hours = parseFloat(editForm.hoursWorked);
      if (clockOut) {
        const duration = moment(clockOut).diff(moment(clockIn), 'hours', true);
        hours = parseFloat(duration.toFixed(2));
      }

      await updateDoc(doc(db, "job_time_entries", editingEntry.id), {
        clockIn,
        clockOut,
        hoursWorked: hours,
        updatedAt: new Date().toISOString(),
      });

      // Update local state
      setTimeEntries(timeEntries.map(e => 
        e.id === editingEntry.id 
          ? { ...e, clockIn, clockOut, hoursWorked: hours }
          : e
      ));

      setEditDialogOpen(false);
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
        <p>${entry.crewName} - ${entry.hoursWorked}h</p>
        <p>${moment(entry.clockIn).format('MMM D, YYYY')}</p>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d32f2f",
      confirmButtonText: "Delete",
    });

    if (result.isConfirmed) {
      try {
        await deleteDoc(doc(db, "job_time_entries", entry.id));
        setTimeEntries(timeEntries.filter(e => e.id !== entry.id));
        Swal.fire("Deleted", "Time entry has been deleted", "success");
      } catch (error) {
        console.error("Error deleting time entry:", error);
        Swal.fire("Error", "Failed to delete time entry", "error");
      }
    }
  };

  if (loading) {
    return (
      <Container sx={{ mt: 4, textAlign: "center" }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Loading pending time entries...</Typography>
      </Container>
    );
  }

  const totalPendingHours = timeEntries.reduce((sum, e) => sum + (parseFloat(e.hoursWorked) || 0), 0);

  return (
    <Container sx={{ mt: 3, pb: 4 }}>
      <Typography variant="h4" gutterBottom>
        ⏳ Approve Time Entries
      </Typography>

      {/* Summary */}
      <Card sx={{ mb: 3, backgroundColor: '#fff3e0' }}>
        <CardContent>
          <Typography variant="h6" color="warning.main" gutterBottom>
            Pending Approval
          </Typography>
          <Typography variant="h3" color="warning.main">
            {totalPendingHours.toFixed(1)}h
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {timeEntries.length} entries awaiting approval
          </Typography>
        </CardContent>
      </Card>

      {/* Time Entries List */}
      <Paper>
        <Box sx={{ p: 2, borderBottom: '1px solid #e0e0e0' }}>
          <Typography variant="h6">Pending Time Entries</Typography>
        </Box>

        {timeEntries.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary" variant="h6">
              ✅ All caught up! No pending time entries.
            </Typography>
          </Box>
        ) : isMobile ? (
          <Box sx={{ p: 2 }}>
            {timeEntries.map((entry) => (
              <Card key={entry.id} sx={{ mb: 2 }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="h6">{entry.crewName}</Typography>
                    <Typography variant="h6" color="primary">
                      {entry.hoursWorked}h
                    </Typography>
                  </Box>

                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {entry.jobName}
                  </Typography>

                  <Typography variant="body2">
                    {moment(entry.clockIn).format('ddd, MMM D, YYYY')}
                  </Typography>
                  
                  <Typography variant="body2">
                    {moment(entry.clockIn).format('h:mm A')} - {moment(entry.clockOut).format('h:mm A')}
                  </Typography>

                  {/* Lunch Break Info */}
                  {entry.lunchMinutes > 0 ? (
                    <Box sx={{ mt: 1, p: 1, backgroundColor: '#fff8e1', borderRadius: 1, border: '1px solid #ffe082' }}>
                      <Typography variant="body2" color="warning.dark" fontWeight="bold">
                        🍔 Lunch Break Taken
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Start: {entry.lunchStartTime ? moment(entry.lunchStartTime).format('h:mm A') : 'N/A'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        End: {entry.lunchEndTime ? moment(entry.lunchEndTime).format('h:mm A') : 'N/A'}
                      </Typography>
                      <Typography variant="body2" color="warning.dark">
                        Duration: {entry.lunchMinutes} min
                      </Typography>
                    </Box>
                  ) : (
                    <Box sx={{ mt: 1, p: 1, backgroundColor: '#f3e5f5', borderRadius: 1, border: '1px solid #ce93d8' }}>
                      <Typography variant="body2" color="secondary.dark">
                        🚫 No Lunch Break Recorded
                      </Typography>
                    </Box>
                  )}

                  {/* 📍 GPS Badge */}
                  <Box sx={{ mt: 1 }}>
                    <GpsBadge entry={entry} />
                  </Box>

                  <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      startIcon={<CheckCircleIcon />}
                      onClick={() => handleApprove(entry)}
                      fullWidth
                    >
                      Approve
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<CancelIcon />}
                      onClick={() => handleReject(entry)}
                      fullWidth
                    >
                      Reject
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="info"
                      startIcon={<EditIcon />}
                      onClick={() => handleEditClick(entry)}
                      fullWidth
                    >
                      Edit
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
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
                {timeEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{entry.crewName}</TableCell>
                    <TableCell>{moment(entry.clockIn).format('MMM D, YYYY')}</TableCell>
                    <TableCell>{entry.jobName}</TableCell>
                    <TableCell>{moment(entry.clockIn).format('h:mm A')}</TableCell>
                    <TableCell>{moment(entry.clockOut).format('h:mm A')}</TableCell>
                    <TableCell>
                      <Typography fontWeight="bold" color="primary">
                        {entry.hoursWorked}h
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {entry.lunchMinutes > 0 ? (
                        <Box>
                          <Typography variant="body2" color="warning.dark" fontWeight="bold">
                            🍔 {entry.lunchMinutes} min
                          </Typography>
                          <Typography variant="caption" color="text.secondary" display="block">
                            {entry.lunchStartTime ? moment(entry.lunchStartTime).format('h:mm A') : '?'} – {entry.lunchEndTime ? moment(entry.lunchEndTime).format('h:mm A') : '?'}
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
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton
                          size="small"
                          color="success"
                          onClick={() => handleApprove(entry)}
                          title="Approve"
                        >
                          <CheckCircleIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleReject(entry)}
                          title="Reject"
                        >
                          <CancelIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="info"
                          onClick={() => handleEditClick(entry)}
                          title="Edit"
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleDelete(entry)}
                          title="Delete"
                        >
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

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Time Entry</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                label="Clock In"
                type="datetime-local"
                value={editForm.clockIn || ''}
                onChange={(e) => setEditForm({ ...editForm, clockIn: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Clock Out"
                type="datetime-local"
                value={editForm.clockOut || ''}
                onChange={(e) => setEditForm({ ...editForm, clockOut: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Hours Worked"
                type="number"
                value={editForm.hoursWorked || ''}
                onChange={(e) => setEditForm({ ...editForm, hoursWorked: e.target.value })}
                fullWidth
                inputProps={{ min: 0, step: 0.5 }}
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
    </Container>
  );
}