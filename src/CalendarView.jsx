import React, { useState, useEffect } from "react";
import { collection, getDocs, doc, deleteDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useNavigate } from "react-router-dom";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import {
  Container,
  Typography,
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Divider,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  useMediaQuery,
  useTheme,
  Checkbox,
  ListItemText,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Paper,
  Fade,
  Zoom,
  Tooltip,
  Badge,
} from "@mui/material";
import Swal from "sweetalert2";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import EditIcon from "@mui/icons-material/Edit";
import ViewWeekIcon from "@mui/icons-material/ViewWeek";
import CalendarViewMonthIcon from "@mui/icons-material/CalendarViewMonth";
import ViewDayIcon from "@mui/icons-material/ViewDay";
import RefreshIcon from "@mui/icons-material/Refresh";
import ListIcon from "@mui/icons-material/List";
import PhoneIcon from "@mui/icons-material/Phone";
import NavigationIcon from "@mui/icons-material/Navigation";
import CloseIcon from "@mui/icons-material/Close";
import TodayIcon from "@mui/icons-material/Today";
import CancelIcon from "@mui/icons-material/Cancel";
import DescriptionIcon from "@mui/icons-material/Description";
import GrassIcon from "@mui/icons-material/Grass";
import { cascadeCancelJob, buildCancelSummary, buildCancelConfirmationMessage } from "./utils/cascadeCancel";

const localizer = momentLocalizer(moment);

export default function CalendarView() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const navigate = useNavigate();

  const [schedules, setSchedules] = useState([]);
  const [crews, setCrews] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [editingEmployees, setEditingEmployees] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [calendarView, setCalendarView] = useState("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(false);
  
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [completionNotes, setCompletionNotes] = useState("");
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    clientName: "",
    jobDescription: "",
    startDate: "",
    endDate: "",
    startTime: "",
    endTime: "",
    priority: "normal",
    status: "scheduled",
    notes: "",
  });

  useEffect(() => {
    loadData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      loadData();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      loadData();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      if (e.key === 't' || e.key === 'T') {
        setCurrentDate(new Date());
      } else if (e.key === 'ArrowLeft') {
        handleNavigate('PREV');
      } else if (e.key === 'ArrowRight') {
        handleNavigate('NEXT');
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [calendarView, currentDate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const schedulesSnap = await getDocs(collection(db, "schedules"));
      const schedulesData = schedulesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setSchedules(schedulesData);

      const crewsSnap = await getDocs(collection(db, "crews"));
      const crewsData = crewsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCrews(crewsData);

      const equipSnap = await getDocs(collection(db, "equipment"));
      const equipData = equipSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setEquipment(equipData);

      const usersSnap = await getDocs(collection(db, "users"));
      const activeEmployees = usersSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((user) => user.active !== false);
      setEmployees(activeEmployees);

      const calendarEvents = schedulesData.map((schedule) => {
        const startDateTime = new Date(`${schedule.startDate}T${schedule.startTime || "08:00"}`);
        const endDateTime = schedule.endDate
          ? new Date(`${schedule.endDate}T${schedule.endTime || "17:00"}`)
          : new Date(`${schedule.startDate}T${schedule.endTime || "17:00"}`);

        return {
          id: schedule.id,
          title: schedule.clientName || "Untitled Job",
          start: startDateTime,
          end: endDateTime,
          resource: schedule,
        };
      });

      setEvents(calendarEvents);
    } catch (error) {
      console.error("Error loading calendar data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectEvent = (event) => {
    setSelectedEvent(event.resource);
    setDetailsOpen(true);
  };

    // Phase 2B: Removed - schedules created through workflow only
  // const handleSelectSlot = ({ start }) => {
  //   const dateStr = moment(start).format("YYYY-MM-DD");
  //   navigate(`/schedule-job?date=${dateStr}`);
  // };

  const handleNavigate = (action) => {
    const newDate = new Date(currentDate);
    
    if (action === 'PREV') {
      if (calendarView === 'month') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else if (calendarView === 'week') {
        newDate.setDate(newDate.getDate() - 7);
      } else {
        newDate.setDate(newDate.getDate() - 1);
      }
    } else if (action === 'NEXT') {
      if (calendarView === 'month') {
        newDate.setMonth(newDate.getMonth() + 1);
      } else if (calendarView === 'week') {
        newDate.setDate(newDate.getDate() + 7);
      } else {
        newDate.setDate(newDate.getDate() + 1);
      }
    }
    
    setCurrentDate(newDate);
  };

  const handleDelete = async (schedule) => {
    // Close the details dialog FIRST so SweetAlert is visible
    setDetailsOpen(false);
    
    const result = await Swal.fire({
      title: "Delete Schedule?",
      text: `Remove ${schedule.clientName}'s scheduled job?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      confirmButtonColor: "#d33",
    });

    if (result.isConfirmed) {
      try {
        await deleteDoc(doc(db, "schedules", schedule.id));

        for (const equipId of schedule.selectedEquipment || []) {
          await updateDoc(doc(db, "equipment", equipId), { status: "available" });
        }

        loadData();
        
        Swal.fire({
          icon: "success",
          title: "Deleted!",
          text: "Schedule removed",
          timer: 2000,
          showConfirmButton: false,
        });
      } catch (error) {
        console.error("Error deleting schedule:", error);
        Swal.fire("Error", "Failed to delete schedule", "error");
      }
    }
  };

  const handleComplete = (schedule) => {
    setCompletionNotes("");
    setCompletionDialogOpen(true);
  };
  
  const handleSaveCompletion = async () => {
    try {
      const updates = {
        status: "completed",
        completedAt: new Date().toISOString(),
      };
      
      if (completionNotes.trim()) {
        updates.completionNotes = completionNotes;
        const existingNotes = selectedEvent.notes || "";
        updates.notes = existingNotes 
          ? `${existingNotes}\n\n[Completed ${moment().format("MM/DD/YYYY")}]\n${completionNotes}`
          : `[Completed ${moment().format("MM/DD/YYYY")}]\n${completionNotes}`;
      }
      
      await updateDoc(doc(db, "schedules", selectedEvent.id), updates);

      for (const equipId of selectedEvent.selectedEquipment || []) {
        await updateDoc(doc(db, "equipment", equipId), { status: "available" });
      }

      setCompletionDialogOpen(false);
      setDetailsOpen(false);
      loadData();
      
      Swal.fire({
        icon: "success",
        title: "Completed!",
        text: "Job marked as completed",
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error("Error completing job:", error);
      Swal.fire("Error", "Failed to update status", "error");
    }
  };
  
  const handleCancelJob = async (schedule) => {
    // Close the details dialog FIRST so SweetAlert is visible
    setDetailsOpen(false);
    
    const result = await Swal.fire({
      title: "Cancel Job?",
      html: buildCancelConfirmationMessage(schedule.clientName, "schedule"),
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Cancel Job",
      confirmButtonColor: "#f44336",
      cancelButtonText: "No, Keep It",
    });

    if (result.isConfirmed) {
      try {
        const cancelResult = await cascadeCancelJob("schedules", schedule.id);
        
        const summaryHtml = buildCancelSummary(cancelResult);
        
        await Swal.fire({
          icon: cancelResult.success ? "success" : "warning",
          title: cancelResult.success ? "Job Cancelled" : "Partial Cancellation",
          html: summaryHtml,
          confirmButtonText: "OK",
        });
        
        loadData();
      } catch (error) {
        console.error("Error cancelling job:", error);
        Swal.fire("Error", "Failed to cancel job. Check console for details.", "error");
      }
    }
  };
  
  const handleOpenEditDialog = (schedule) => {
    setEditForm({
      clientName: schedule.clientName || "",
      jobDescription: schedule.jobDescription || "",
      startDate: schedule.startDate || "",
      endDate: schedule.endDate || schedule.startDate || "",
      startTime: schedule.startTime || "08:00",
      endTime: schedule.endTime || "17:00",
      priority: schedule.priority || "normal",
      status: schedule.status || "scheduled",
      notes: schedule.notes || "",
    });
    setEditDialogOpen(true);
  };
  
  const handleSaveEdit = async () => {
    try {
      await updateDoc(doc(db, "schedules", selectedEvent.id), {
        clientName: editForm.clientName,
        jobDescription: editForm.jobDescription,
        startDate: editForm.startDate,
        endDate: editForm.endDate,
        startTime: editForm.startTime,
        endTime: editForm.endTime,
        priority: editForm.priority,
        status: editForm.status,
        notes: editForm.notes,
        updatedAt: new Date().toISOString(),
      });

      setEditDialogOpen(false);
      setDetailsOpen(false);
      loadData();
      
      Swal.fire({
        icon: "success",
        title: "Success!",
        text: "Job updated successfully",
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error("Error updating job:", error);
      Swal.fire("Error", "Failed to update job", "error");
    }
  };

  const getCrewNames = (crewIds) => {
    if (!crewIds || crewIds.length === 0) return "No crew assigned";
    return crewIds
      .map((id) => crews.find((c) => c.id === id)?.name)
      .filter(Boolean)
      .join(", ");
  };

  const getEquipmentNames = (equipIds) => {
    if (!equipIds || equipIds.length === 0) return "No equipment";
    return equipIds
      .map((id) => equipment.find((e) => e.id === id)?.name)
      .filter(Boolean)
      .join(", ");
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case "urgent": return "#f44336";
      case "high": return "#ff9800";
      case "normal": return "#2196f3";
      case "low": return "#9e9e9e";
      default: return "#9e9e9e";
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "completed": return "#4caf50";
      case "in-progress": return "#ff9800";
      case "scheduled": return "#2196f3";
      case "cancelled": return "#f44336";
      default: return "#9e9e9e";
    }
  };

  const eventStyleGetter = (event) => {
    const schedule = event.resource;
    let backgroundColor = getPriorityColor(schedule.priority || "normal");

    if (schedule.status === "completed") {
      backgroundColor = "#4caf50";
    } else if (schedule.status === "cancelled") {
      backgroundColor = "#f44336";
    }

    return {
      style: {
        backgroundColor,
        borderRadius: "8px",
        opacity: schedule.status === "completed" || schedule.status === "cancelled" ? 0.7 : 0.95,
        color: "white",
        border: "none",
        display: "block",
        fontSize: "0.9rem",
        fontWeight: 600,
        padding: "4px 8px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        transition: "all 0.2s",
        textDecoration: schedule.status === "cancelled" ? "line-through" : "none",
      },
    };
  };

  const totalJobs = schedules.length;
  const completedJobs = schedules.filter(s => s.status === "completed").length;
  const cancelledJobs = schedules.filter(s => s.status === "cancelled").length;
  const urgentJobs = schedules.filter(s => s.priority === "urgent" && s.status !== "completed").length;

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: '#f5f7fa' }}>
      {/* PURPLE GRADIENT HEADER */}
      <Paper 
        elevation={3} 
        sx={{ 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
          color: 'white', 
          p: 3,
          mb: 3,
          borderRadius: 0,
        }}
      >
        <Container maxWidth="xl">
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
                📅 Calendar View
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Chip 
                  label={`${totalJobs} Total Jobs`} 
                  size="small" 
                  sx={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 600 }} 
                />
                <Chip 
                  label={`${completedJobs} Completed`} 
                  size="small" 
                  sx={{ backgroundColor: 'rgba(76,175,80,0.3)', color: 'white', fontWeight: 600 }} 
                />
                {cancelledJobs > 0 && (
                  <Chip 
                    label={`${cancelledJobs} Cancelled`} 
                    size="small" 
                    sx={{ backgroundColor: 'rgba(244,67,54,0.3)', color: 'white', fontWeight: 600 }} 
                  />
                )}
                {urgentJobs > 0 && (
                  <Badge badgeContent={urgentJobs} color="error">
                    <Chip 
                      label="Urgent Jobs" 
                      size="small" 
                      sx={{ backgroundColor: 'rgba(244,67,54,0.3)', color: 'white', fontWeight: 600 }} 
                    />
                  </Badge>
                )}
              </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Tooltip title="Refresh (or press T for Today)">
                <IconButton
                  onClick={loadData}
                  disabled={loading}
                  sx={{ 
                    color: 'white', 
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    '&:hover': { backgroundColor: 'rgba(255,255,255,0.2)' }
                  }}
                >
                  <RefreshIcon />
                </IconButton>
              </Tooltip>

              <Tooltip title="Go to Today">
                <IconButton
                  onClick={() => setCurrentDate(new Date())}
                  sx={{ 
                    color: 'white', 
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    '&:hover': { backgroundColor: 'rgba(255,255,255,0.2)' }
                  }}
                >
                  <TodayIcon />
                </IconButton>
              </Tooltip>

              {!isMobile && (
                <ToggleButtonGroup
                  value={calendarView}
                  exclusive
                  onChange={(e, newView) => newView && setCalendarView(newView)}
                  size="small"
                  sx={{
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    '& .MuiToggleButton-root': {
                      color: 'rgba(255,255,255,0.7)',
                      border: 'none',
                      '&.Mui-selected': {
                        backgroundColor: 'white',
                        color: '#667eea',
                        fontWeight: 700,
                      }
                    }
                  }}
                >
                  <ToggleButton value="month">
                    <CalendarViewMonthIcon sx={{ mr: 0.5 }} fontSize="small" />
                    Month
                  </ToggleButton>
                  <ToggleButton value="week">
                    <ViewWeekIcon sx={{ mr: 0.5 }} fontSize="small" />
                    Week
                  </ToggleButton>
                  <ToggleButton value="day">
                    <ViewDayIcon sx={{ mr: 0.5 }} fontSize="small" />
                    Day
                  </ToggleButton>
                </ToggleButtonGroup>
              )}

              <Button
                variant="outlined"
                size="small"
                startIcon={<ListIcon />}
                onClick={() => navigate("/schedule-dashboard")}
                sx={{
                  color: 'white',
                  borderColor: 'rgba(255,255,255,0.5)',
                  '&:hover': { borderColor: 'white', backgroundColor: 'rgba(255,255,255,0.1)' }
                }}
              >
                List View
              </Button>
              
              <Button
                variant="contained"
                size="small"
                startIcon={<DescriptionIcon />}
                onClick={() => navigate("/create-bid")}
                sx={{
                  backgroundColor: 'white',
                  color: '#764ba2',
                  fontWeight: 600,
                  '&:hover': { backgroundColor: 'rgba(255,255,255,0.9)' }
                }}
              >
                New Job (Bid)
              </Button>
              
              <Button
                variant="contained"
                size="small"
                startIcon={<GrassIcon />}
                onClick={() => navigate("/invoices?quickWeed=true")}
                sx={{
                  backgroundColor: '#4caf50',
                  color: 'white',
                  fontWeight: 600,
                  '&:hover': { backgroundColor: '#45a049' }
                }}
              >
                Quick Weed Job
              </Button>
              
            </Box>
          </Box>

          {/* Color Legend */}
          <Box sx={{ display: 'flex', gap: 2, mt: 2, flexWrap: 'wrap' }}>
            <Chip 
              label="🔴 Urgent" 
              size="small" 
              sx={{ backgroundColor: 'rgba(244,67,54,0.2)', color: 'white', fontWeight: 600 }} 
            />
            <Chip 
              label="🟠 High Priority" 
              size="small" 
              sx={{ backgroundColor: 'rgba(255,152,0,0.2)', color: 'white', fontWeight: 600 }} 
            />
            <Chip 
              label="🔵 Normal" 
              size="small" 
              sx={{ backgroundColor: 'rgba(33,150,243,0.2)', color: 'white', fontWeight: 600 }} 
            />
            <Chip 
              label="✅ Completed" 
              size="small" 
              sx={{ backgroundColor: 'rgba(76,175,80,0.2)', color: 'white', fontWeight: 600 }} 
            />
            <Chip 
              label="❌ Cancelled" 
              size="small" 
              sx={{ backgroundColor: 'rgba(244,67,54,0.2)', color: 'white', fontWeight: 600 }} 
            />
          </Box>
        </Container>
      </Paper>

      <Container maxWidth="xl" sx={{ mb: 6 }}>
        {/* Calendar */}
        <Paper
          elevation={3}
          sx={{
            p: { xs: 1, sm: 2 },
            borderRadius: 2,
            "& .rbc-calendar": {
              minHeight: isMobile ? "400px" : "700px",
            },
            "& .rbc-event": {
              fontSize: isMobile ? "0.75rem" : "0.9rem",
            },
            "& .rbc-toolbar button": {
              fontSize: isMobile ? "0.8rem" : "1rem",
            },
            "& .rbc-today": {
              backgroundColor: "#e3f2fd !important",
            },
            "& .rbc-header": {
              padding: "12px 4px",
              fontWeight: 700,
              backgroundColor: "#f5f5f5",
              borderBottom: "2px solid #e0e0e0",
            },
            "& .rbc-event:hover": {
              transform: "scale(1.02)",
              boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
              cursor: "pointer",
            },
          }}
        >
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            style={{ height: isMobile ? 500 : 700 }}
            onSelectEvent={handleSelectEvent}            
            onDoubleClickEvent={(event) => handleSelectEvent(event)}
            selectable
            view={calendarView}
            onView={setCalendarView}
            date={currentDate}
            onNavigate={(newDate) => setCurrentDate(newDate)}
            eventPropGetter={eventStyleGetter}
            views={["month", "week", "day"]}
            popup
            tooltipAccessor={(event) => `${event.title} - ${event.resource.jobDescription || 'No description'}`}
          />
        </Paper>
      </Container>

      {/* Event Details Dialog */}
      <Dialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
        TransitionComponent={Zoom}
        PaperProps={{
          sx: { borderRadius: 2 }
        }}
      >
        {selectedEvent && (
          <>
            <DialogTitle sx={{ backgroundColor: '#667eea', color: 'white' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Job Details</Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Chip
                    label={selectedEvent.status || "scheduled"}
                    sx={{
                      backgroundColor: getStatusColor(selectedEvent.status),
                      color: 'white',
                      fontWeight: 700,
                    }}
                    size="small"
                  />
                  {selectedEvent.priority && selectedEvent.priority !== "normal" && (
                    <Chip
                      label={selectedEvent.priority}
                      sx={{
                        backgroundColor: getPriorityColor(selectedEvent.priority),
                        color: 'white',
                        fontWeight: 700,
                      }}
                      size="small"
                    />
                  )}
                  <IconButton onClick={() => setDetailsOpen(false)} sx={{ color: 'white' }} size="small">
                    <CloseIcon />
                  </IconButton>
                </Box>
              </Box>
            </DialogTitle>
            <DialogContent sx={{ mt: 2 }}>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Client
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>{selectedEvent.clientName}</Typography>
                </Box>

                {selectedEvent.jobDescription && (
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Job Description
                    </Typography>
                    <Typography variant="body1">{selectedEvent.jobDescription}</Typography>
                  </Box>
                )}

                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Schedule
                  </Typography>
                  <Typography variant="body1">
                    📅 {moment(selectedEvent.startDate).format("MMM DD, YYYY")}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    ⏰ {selectedEvent.startTime} - {selectedEvent.endTime}
                  </Typography>
                  {selectedEvent.endDate && selectedEvent.endDate !== selectedEvent.startDate && (
                    <Typography variant="body2" color="text.secondary">
                      Ends: {moment(selectedEvent.endDate).format("MMM DD, YYYY")}
                    </Typography>
                  )}
                </Box>

                <Divider />

                {/* Quick Actions */}
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    Quick Actions
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {selectedEvent.customerPhone && (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<PhoneIcon />}
                        onClick={() => window.open(`tel:${selectedEvent.customerPhone}`)}
                        sx={{ borderColor: '#667eea', color: '#667eea' }}
                      >
                        Call
                      </Button>
                    )}
                    {selectedEvent.customerAddress && (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<NavigationIcon />}
                        onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedEvent.customerAddress)}`)}
                        sx={{ borderColor: '#667eea', color: '#667eea' }}
                      >
                        Navigate
                      </Button>
                    )}
                  </Box>
                </Box>

                <Divider />

                <Box>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    👷 Assigned Employees
                  </Typography>
                  {!editingEmployees ? (
                    <>
                      {selectedEvent.assignedEmployees && selectedEvent.assignedEmployees.length > 0 ? (
                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 1 }}>
                          {selectedEvent.assignedEmployees.map((empId) => {
                            const emp = employees.find((e) => e.id === empId);
                            return emp ? (
                              <Chip
                                key={empId}
                                label={emp.name || emp.email}
                                size="small"
                                color="primary"
                                variant="outlined"
                              />
                            ) : null;
                          })}
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          No employees assigned
                        </Typography>
                      )}
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<EditIcon />}
                        onClick={() => {
                          setEditingEmployees(true);
                          setSelectedEmployeeIds(selectedEvent.assignedEmployees || []);
                        }}
                        sx={{ mt: 1, borderColor: '#667eea', color: '#667eea' }}
                      >
                        Edit Employees
                      </Button>
                    </>
                  ) : (
                    <>
                      <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                        <InputLabel>Select Employees</InputLabel>
                        <Select
                          multiple
                          value={selectedEmployeeIds}
                          onChange={(e) => setSelectedEmployeeIds(e.target.value)}
                          renderValue={(selected) => (
                            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                              {selected.map((empId) => {
                                const emp = employees.find((e) => e.id === empId);
                                return (
                                  <Chip
                                    key={empId}
                                    label={emp?.name || emp?.email || empId}
                                    size="small"
                                  />
                                );
                              })}
                            </Box>
                          )}
                        >
                          {employees.map((emp) => (
                            <MenuItem key={emp.id} value={emp.id}>
                              <Checkbox checked={selectedEmployeeIds.indexOf(emp.id) > -1} />
                              <ListItemText primary={emp.name || emp.email} />
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <Box sx={{ display: "flex", gap: 1 }}>
                        <Button
                          size="small"
                          variant="contained"
                          sx={{ backgroundColor: '#667eea' }}
                          onClick={async () => {
                            try {
                              await updateDoc(doc(db, "schedules", selectedEvent.id), {
                                assignedEmployees: selectedEmployeeIds,
                              });
                              setSelectedEvent({
                                ...selectedEvent,
                                assignedEmployees: selectedEmployeeIds,
                              });
                              setEditingEmployees(false);
                              await loadData();
                              Swal.fire({
                                icon: "success",
                                title: "Success!",
                                text: "Employees updated",
                                timer: 2000,
                                showConfirmButton: false,
                              });
                            } catch (error) {
                              console.error("Error updating employees:", error);
                              Swal.fire("Error", "Failed to update employees", "error");
                            }
                          }}
                        >
                          Save
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            setEditingEmployees(false);
                            setSelectedEmployeeIds(selectedEvent.assignedEmployees || []);
                          }}
                        >
                          Cancel
                        </Button>
                      </Box>
                    </>
                  )}
                </Box>

                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    🚛 Equipment
                  </Typography>
                  <Typography variant="body1">
                    {getEquipmentNames(selectedEvent.selectedEquipment)}
                  </Typography>
                </Box>

                {selectedEvent.notes && (
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      📝 Notes
                    </Typography>
                    <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                      {selectedEvent.notes}
                    </Typography>
                  </Box>
                )}
                
                {selectedEvent.completionNotes && (
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      ✅ Completion Notes
                    </Typography>
                    <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                      {selectedEvent.completionNotes}
                    </Typography>
                  </Box>
                )}
              </Box>
            </DialogContent>
            <DialogActions sx={{ p: 2, gap: 1, flexWrap: "wrap" }}>
              <Button
                variant="outlined"
                startIcon={<EditIcon />}
                onClick={() => handleOpenEditDialog(selectedEvent)}
                fullWidth={isMobile}
                sx={{ borderColor: '#667eea', color: '#667eea' }}
              >
                Edit Job
              </Button>
              {selectedEvent.contractId && (
                <Button
                  variant="outlined"
                  startIcon={<EditIcon />}
                  onClick={() => {
                    setDetailsOpen(false);
                    navigate(`/contract/${selectedEvent.contractId}`);
                  }}
                  fullWidth={isMobile}
                  sx={{ borderColor: '#667eea', color: '#667eea' }}
                >
                  View Contract
                </Button>
              )}
              {selectedEvent.invoiceId && (
                <Button
                  variant="outlined"
                  startIcon={<DescriptionIcon />}
                  onClick={() => {
                    setDetailsOpen(false);
                    navigate(`/invoice/${selectedEvent.invoiceId}`);
                  }}
                  fullWidth={isMobile}
                  sx={{ borderColor: '#667eea', color: '#667eea' }}
                >
                  View Invoice
                </Button>
              )}
              {selectedEvent.status !== "completed" && selectedEvent.status !== "cancelled" && (
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<CheckCircleIcon />}
                  onClick={() => handleComplete(selectedEvent)}
                  fullWidth={isMobile}
                >
                  Mark Complete
                </Button>
              )}
              {selectedEvent.status !== "completed" && selectedEvent.status !== "cancelled" && (
                <Button
                  variant="outlined"
                  color="warning"
                  startIcon={<CancelIcon />}
                  onClick={() => handleCancelJob(selectedEvent)}
                  fullWidth={isMobile}
                >
                  Cancel Job
                </Button>
              )}
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => handleDelete(selectedEvent)}
                fullWidth={isMobile}
              >
                Delete
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
      
      {/* Completion Notes Dialog */}
      <Dialog
        open={completionDialogOpen}
        onClose={() => setCompletionDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        TransitionComponent={Fade}
      >
        <DialogTitle sx={{ backgroundColor: '#4caf50', color: 'white', fontWeight: 700 }}>
          Complete Job
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Add notes about what was completed, any issues encountered, or additional work done.
          </Typography>
          <TextField
            label="Completion Notes"
            multiline
            rows={4}
            fullWidth
            value={completionNotes}
            onChange={(e) => setCompletionNotes(e.target.value)}
            placeholder="Example: Completed weed spraying. Applied pre-emergent herbicide to all areas. Some areas needed extra attention due to heavy weed growth."
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setCompletionDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveCompletion} variant="contained" color="success">
            Mark Complete
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Edit Job Dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
        TransitionComponent={Zoom}
      >
        <DialogTitle sx={{ backgroundColor: '#667eea', color: 'white', fontWeight: 700 }}>
          Edit Job
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label="Client Name"
              fullWidth
              value={editForm.clientName}
              onChange={(e) => setEditForm({ ...editForm, clientName: e.target.value })}
            />
            
            <TextField
              label="Job Description"
              fullWidth
              multiline
              rows={3}
              value={editForm.jobDescription}
              onChange={(e) => setEditForm({ ...editForm, jobDescription: e.target.value })}
            />
            
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              <TextField
                label="Start Date"
                type="date"
                value={editForm.startDate}
                onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
                sx={{ flex: 1, minWidth: "200px" }}
              />
              
              <TextField
                label="End Date"
                type="date"
                value={editForm.endDate}
                onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
                sx={{ flex: 1, minWidth: "200px" }}
              />
            </Box>
            
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              <TextField
                label="Start Time"
                type="time"
                value={editForm.startTime}
                onChange={(e) => setEditForm({ ...editForm, startTime: e.target.value })}
                InputLabelProps={{ shrink: true }}
                sx={{ flex: 1, minWidth: "150px" }}
              />
              
              <TextField
                label="End Time"
                type="time"
                value={editForm.endTime}
                onChange={(e) => setEditForm({ ...editForm, endTime: e.target.value })}
                InputLabelProps={{ shrink: true }}
                sx={{ flex: 1, minWidth: "150px" }}
              />
            </Box>
            
            <FormControl fullWidth>
              <InputLabel>Priority</InputLabel>
              <Select
                value={editForm.priority}
                onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                label="Priority"
              >
                <MenuItem value="low">Low</MenuItem>
                <MenuItem value="normal">Normal</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="urgent">Urgent</MenuItem>
              </Select>
            </FormControl>
            
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                label="Status"
              >
                <MenuItem value="scheduled">Scheduled</MenuItem>
                <MenuItem value="in-progress">In Progress</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
                <MenuItem value="cancelled">Cancelled</MenuItem>
              </Select>
            </FormControl>
            
            <TextField
              label="Notes"
              fullWidth
              multiline
              rows={3}
              value={editForm.notes}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveEdit} variant="contained" sx={{ backgroundColor: '#667eea' }}>
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}