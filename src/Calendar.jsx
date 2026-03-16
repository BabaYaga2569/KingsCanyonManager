import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "./firebase";
import { collection, getDocs, doc, updateDoc, deleteDoc } from "firebase/firestore";
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  useMediaQuery,
  useTheme,
  Paper,
  Stack,
  Divider,
  List,
  ListItem,
  ListItemText,
} from "@mui/material";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import TodayIcon from "@mui/icons-material/Today";
import AddIcon from "@mui/icons-material/Add";
import PhoneIcon from "@mui/icons-material/Phone";
import NavigationIcon from "@mui/icons-material/Navigation";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RefreshIcon from "@mui/icons-material/Refresh";
import CalendarViewMonthIcon from "@mui/icons-material/CalendarViewMonth";
import ViewWeekIcon from "@mui/icons-material/ViewWeek";
import ViewDayIcon from "@mui/icons-material/ViewDay";
import ViewListIcon from "@mui/icons-material/ViewList";
import AccessTimeIcon from "@mui/icons-material/AccessTime";

export default function Calendar() {
  const [appointments, setAppointments] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState("month"); // month, week, day, list
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    try {
      const snap = await getDocs(collection(db, "appointments"));
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setAppointments(data);
    } catch (error) {
      console.error("Error fetching appointments:", error);
    }
  };

  const handlePrevious = () => {
    const newDate = new Date(currentDate);
    if (view === "month") {
      newDate.setMonth(newDate.getMonth() - 1);
    } else if (view === "week") {
      newDate.setDate(newDate.getDate() - 7);
    } else if (view === "day") {
      newDate.setDate(newDate.getDate() - 1);
    }
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    if (view === "month") {
      newDate.setMonth(newDate.getMonth() + 1);
    } else if (view === "week") {
      newDate.setDate(newDate.getDate() + 7);
    } else if (view === "day") {
      newDate.setDate(newDate.getDate() + 1);
    }
    setCurrentDate(newDate);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const getAppointmentsForDate = (date) => {
    const dateStr = date.toISOString().split("T")[0];
    return appointments.filter((apt) => {
      const aptDate = apt.scheduledDate || "";
      return aptDate.startsWith(dateStr);
    }).sort((a, b) => {
      const timeA = a.startTime || "";
      const timeB = b.startTime || "";
      return timeA.localeCompare(timeB);
    });
  };

  const handleAppointmentClick = (apt) => {
    setSelectedAppointment(apt);
    setDetailsOpen(true);
  };

  const handleStatusChange = async (newStatus) => {
    if (!selectedAppointment) return;
    try {
      await updateDoc(doc(db, "appointments", selectedAppointment.id), {
        status: newStatus,
      });
      setAppointments((prev) =>
        prev.map((apt) =>
          apt.id === selectedAppointment.id ? { ...apt, status: newStatus } : apt
        )
      );
      setSelectedAppointment({ ...selectedAppointment, status: newStatus });
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const handleDelete = async () => {
    if (!selectedAppointment) return;
    if (window.confirm("Delete this appointment?")) {
      try {
        await deleteDoc(doc(db, "appointments", selectedAppointment.id));
        setAppointments((prev) =>
          prev.filter((apt) => apt.id !== selectedAppointment.id)
        );
        setDetailsOpen(false);
      } catch (error) {
        console.error("Error deleting appointment:", error);
      }
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case "completed":
        return "#4caf50";
      case "in progress":
        return "#2196f3";
      case "scheduled":
        return "#2196f3";
      case "cancelled":
        return "#f44336";
      case "pending":
        return "#ff9800";
      default:
        return "#9e9e9e";
    }
  };

  const getStatusChipStyle = (status) => {
    const color = getStatusColor(status);
    return {
      backgroundColor: color,
      color: 'white',
      fontWeight: 600,
      fontSize: { xs: "0.6rem", md: "0.75rem" },
      height: { xs: 20, md: 24 },
      borderRadius: '12px',
      mb: 0.5,
      maxWidth: "100%",
      transition: 'all 0.2s',
      '&:hover': {
        transform: 'scale(1.05)',
        boxShadow: 2,
      }
    };
  };

  // Get week range
  const getWeekDays = () => {
    const dayOfWeek = currentDate.getDay();
    const firstDay = new Date(currentDate);
    firstDay.setDate(currentDate.getDate() - dayOfWeek);
    
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(firstDay);
      day.setDate(firstDay.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const getWeekRange = () => {
    const weekDays = getWeekDays();
    const start = weekDays[0];
    const end = weekDays[6];
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  const renderMonthView = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return (
      <Paper elevation={2} sx={{ p: 2, borderRadius: 2 }}>
        <Grid container spacing={1} sx={{ mb: 1 }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <Grid item xs={12 / 7} key={day}>
              <Box sx={{ 
                textAlign: "center", 
                fontWeight: 700, 
                py: 1.5, 
                backgroundColor: '#f5f5f5', 
                borderRadius: 1 
              }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {day}
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>

        <Grid container spacing={1}>
          {days.map((date, index) => {
            if (!date) {
              return (
                <Grid item xs={12 / 7} key={`empty-${index}`}>
                  <Paper elevation={0} sx={{ minHeight: { xs: 80, md: 140 }, backgroundColor: '#fafafa', borderRadius: 2 }} />
                </Grid>
              );
            }

            const dayAppointments = getAppointmentsForDate(date);
            const isToday = date.toDateString() === new Date().toDateString();

            return (
              <Grid item xs={12 / 7} key={index}>
                <Paper
                  elevation={isToday ? 8 : 1}
                  sx={{
                    minHeight: { xs: 80, md: 140 },
                    p: { xs: 1, md: 1.5 },
                    backgroundColor: isToday ? "#e3f2fd" : "white",
                    border: isToday ? "3px solid #2196f3" : "1px solid #e0e0e0",
                    borderRadius: 2,
                    cursor: "pointer",
                    transition: 'all 0.2s',
                    "&:hover": {
                      backgroundColor: isToday ? "#bbdefb" : "#f5f5f5",
                      transform: 'translateY(-4px)',
                      boxShadow: 4,
                    },
                  }}
                >
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: isToday ? 700 : 600,
                      color: isToday ? "#2196f3" : "#333",
                      mb: 1,
                      fontSize: { xs: "1rem", md: "1.25rem" },
                    }}
                  >
                    {date.getDate()}
                  </Typography>
                  <Stack spacing={0.5}>
                    {dayAppointments.slice(0, isMobile ? 2 : 4).map((apt) => (
                      <Chip
                        key={apt.id}
                        label={apt.customerName}
                        size="small"
                        onClick={() => handleAppointmentClick(apt)}
                        sx={getStatusChipStyle(apt.status)}
                      />
                    ))}
                    {dayAppointments.length > (isMobile ? 2 : 4) && (
                      <Typography 
                        variant="caption" 
                        sx={{ 
                          fontSize: "0.7rem", 
                          textAlign: 'center', 
                          color: '#666',
                          fontWeight: 600,
                          pt: 0.5
                        }}
                      >
                        +{dayAppointments.length - (isMobile ? 2 : 4)} more
                      </Typography>
                    )}
                  </Stack>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      </Paper>
    );
  };

  const renderWeekView = () => {
    const weekDays = getWeekDays();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return (
      <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
        {weekDays.map((date, index) => {
          const dayAppointments = getAppointmentsForDate(date);
          const isToday = date.toDateString() === new Date().toDateString();

          return (
            <Box key={index} sx={{ mb: 2 }}>
              <Card 
                elevation={isToday ? 4 : 1}
                sx={{ 
                  border: isToday ? '3px solid #2196f3' : '1px solid #e0e0e0',
                  backgroundColor: isToday ? '#e3f2fd' : '#fff',
                  transition: 'all 0.2s',
                  '&:hover': { boxShadow: 4 }
                }}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Box>
                      <Typography variant="h5" sx={{ fontWeight: 700, color: isToday ? '#2196f3' : '#333' }}>
                        {dayNames[date.getDay()]}, {date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {dayAppointments.length} appointment{dayAppointments.length !== 1 ? 's' : ''} scheduled
                      </Typography>
                    </Box>                    
                  </Box>

                  <Divider sx={{ mb: 2 }} />

                  {dayAppointments.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3, fontStyle: 'italic' }}>
                      No appointments scheduled
                    </Typography>
                  ) : (
                    <Stack spacing={1.5}>
                      {dayAppointments.map((apt) => (
                        <Card
                          key={apt.id}
                          onClick={() => handleAppointmentClick(apt)}
                          sx={{
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            border: `2px solid ${getStatusColor(apt.status)}`,
                            '&:hover': { 
                              transform: 'translateX(8px)',
                              boxShadow: 3
                            }
                          }}
                        >
                          <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                              <Box sx={{ flex: 1 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                    {apt.customerName}
                                  </Typography>
                                  <Chip 
                                    label={apt.status || "Scheduled"} 
                                    size="small" 
                                    sx={{ 
                                      backgroundColor: getStatusColor(apt.status), 
                                      color: 'white',
                                      fontWeight: 600
                                    }} 
                                  />
                                </Box>
                                <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <AccessTimeIcon sx={{ fontSize: 18, color: '#666' }} />
                                    <Typography variant="body2" color="text.secondary">
                                      {apt.startTime} • {apt.duration || 120} min
                                    </Typography>
                                  </Box>
                                  <Typography variant="body2" color="text.secondary">
                                    <strong>Service:</strong> {apt.description}
                                  </Typography>
                                  <Typography variant="body2" sx={{ color: '#4caf50', fontWeight: 700 }}>
                                    ${apt.amount}
                                  </Typography>
                                </Box>
                              </Box>
                            </Box>
                          </CardContent>
                        </Card>
                      ))}
                    </Stack>
                  )}
                </CardContent>
              </Card>
            </Box>
          );
        })}
      </Paper>
    );
  };

  const renderDayView = () => {
    const today = currentDate;
    const todayAppointments = getAppointmentsForDate(today);

    if (todayAppointments.length === 0) {
      return (
        <Paper elevation={2} sx={{ textAlign: "center", mt: 3, p: 5, borderRadius: 2 }}>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
            No appointments scheduled for this day
          </Typography>
          
        </Paper>
      );
    }

    return (
      <Box sx={{ mt: 2 }}>
        {todayAppointments.map((apt) => (
          <Card 
            key={apt.id} 
            sx={{ 
              mb: 2, 
              boxShadow: 3,
              borderRadius: 2,
              border: `2px solid ${getStatusColor(apt.status)}`,
              transition: 'all 0.2s',
              '&:hover': {
                transform: 'translateX(8px)',
                boxShadow: 6,
              }
            }}
          >
            <CardContent>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2, alignItems: 'center' }}>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {apt.customerName}
                </Typography>
                <Chip
                  label={apt.status || "Scheduled"}
                  sx={{
                    backgroundColor: getStatusColor(apt.status),
                    color: 'white',
                    fontWeight: 700,
                  }}
                />
              </Box>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
                ⏰ {apt.startTime} • {apt.duration || 120} min
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                {apt.description}
              </Typography>
              <Typography variant="h5" sx={{ color: '#4caf50', fontWeight: 700, mb: 2 }}>
                ${apt.amount}
              </Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<NavigationIcon />}
                  onClick={() =>
                    window.open(
                      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        apt.customerAddress || apt.customerName
                      )}`
                    )
                  }
                  sx={{
                    borderColor: '#667eea',
                    color: '#667eea',
                    '&:hover': { borderColor: '#5568d3', backgroundColor: 'rgba(102,126,234,0.1)' }
                  }}
                >
                  Navigate
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<PhoneIcon />}
                  onClick={() => window.open(`tel:${apt.customerPhone}`)}
                  sx={{
                    borderColor: '#667eea',
                    color: '#667eea',
                    '&:hover': { borderColor: '#5568d3', backgroundColor: 'rgba(102,126,234,0.1)' }
                  }}
                >
                  Call
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  startIcon={<CheckCircleIcon />}
                  onClick={() => {
                    setSelectedAppointment(apt);
                    handleStatusChange("Completed");
                  }}
                  sx={{ fontWeight: 600 }}
                >
                  Complete
                </Button>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>
    );
  };

  const renderListView = () => {
    // Get all appointments and sort by date
    const sortedAppointments = [...appointments].sort((a, b) => {
      const dateA = a.scheduledDate || "";
      const dateB = b.scheduledDate || "";
      if (dateA === dateB) {
        return (a.startTime || "").localeCompare(b.startTime || "");
      }
      return dateA.localeCompare(dateB);
    });

    // Group by date
    const groupedByDate = sortedAppointments.reduce((groups, apt) => {
      const date = apt.scheduledDate || "No Date";
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(apt);
      return groups;
    }, {});

    return (
      <Paper elevation={2} sx={{ p: 2, borderRadius: 2, maxHeight: '70vh', overflow: 'auto' }}>
        {Object.keys(groupedByDate).length === 0 ? (
          <Box sx={{ textAlign: 'center', p: 5 }}>
            <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
              No appointments found
            </Typography>
            
          </Box>
        ) : (
          Object.keys(groupedByDate).map((date) => {
            const dateObj = new Date(date);
            const isToday = dateObj.toDateString() === new Date().toDateString();
            
            return (
              <Box key={date} sx={{ mb: 3 }}>
                <Typography 
                  variant="h6" 
                  sx={{ 
                    fontWeight: 700, 
                    mb: 2, 
                    color: isToday ? '#2196f3' : '#333',
                    backgroundColor: isToday ? '#e3f2fd' : '#f5f5f5',
                    p: 1.5,
                    borderRadius: 1
                  }}
                >
                  📅 {dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  {isToday && <Chip label="TODAY" size="small" sx={{ ml: 2, backgroundColor: '#2196f3', color: 'white', fontWeight: 700 }} />}
                </Typography>
                <Stack spacing={1.5}>
                  {groupedByDate[date].map((apt) => (
                    <Card
                      key={apt.id}
                      onClick={() => handleAppointmentClick(apt)}
                      sx={{
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        border: `2px solid ${getStatusColor(apt.status)}`,
                        '&:hover': { 
                          transform: 'translateX(8px)',
                          boxShadow: 4
                        }
                      }}
                    >
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 1 }}>
                          <Box sx={{ flex: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                {apt.customerName}
                              </Typography>
                              <Chip 
                                label={apt.status || "Scheduled"} 
                                size="small" 
                                sx={{ 
                                  backgroundColor: getStatusColor(apt.status), 
                                  color: 'white',
                                  fontWeight: 600
                                }} 
                              />
                            </Box>
                            <Grid container spacing={2}>
                              <Grid item xs={12} sm={6} md={3}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <AccessTimeIcon sx={{ fontSize: 18, color: '#666' }} />
                                  <Typography variant="body2" color="text.secondary">
                                    {apt.startTime} • {apt.duration || 120} min
                                  </Typography>
                                </Box>
                              </Grid>
                              <Grid item xs={12} sm={6} md={4}>
                                <Typography variant="body2" color="text.secondary">
                                  <strong>Service:</strong> {apt.description}
                                </Typography>
                              </Grid>
                              <Grid item xs={12} sm={6} md={3}>
                                <Typography variant="body2" sx={{ color: '#4caf50', fontWeight: 700 }}>
                                  Amount: ${apt.amount}
                                </Typography>
                              </Grid>
                              <Grid item xs={12} sm={6} md={2}>
                                <Box sx={{ display: 'flex', gap: 0.5 }}>
                                  <IconButton 
                                    size="small" 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.open(`tel:${apt.customerPhone}`);
                                    }}
                                    sx={{ color: '#667eea' }}
                                  >
                                    <PhoneIcon fontSize="small" />
                                  </IconButton>
                                  <IconButton 
                                    size="small" 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(apt.customerAddress || apt.customerName)}`);
                                    }}
                                    sx={{ color: '#667eea' }}
                                  >
                                    <NavigationIcon fontSize="small" />
                                  </IconButton>
                                </Box>
                              </Grid>
                            </Grid>
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              </Box>
            );
          })
        )}
      </Paper>
    );
  };

  const getViewTitle = () => {
    if (view === "list") return "All Appointments";
    if (view === "week") return getWeekRange();
    if (view === "day") return currentDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return currentDate.toLocaleString("default", { month: "long", year: "numeric" });
  };

  return (
    <Box sx={{ mt: 4, mb: 4 }}>
      {/* PURPLE GRADIENT HEADER */}
      <Paper 
        elevation={3} 
        sx={{ 
          p: 3, 
          mb: 3, 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
          color: 'white', 
          borderRadius: 2 
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              📅 {getViewTitle()}
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={handleToday}
              startIcon={<TodayIcon />}
              sx={{
                color: 'white',
                borderColor: 'rgba(255,255,255,0.5)',
                '&:hover': { borderColor: 'white', backgroundColor: 'rgba(255,255,255,0.1)' }
              }}
            >
              Today
            </Button>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            {/* VIEW TOGGLE */}
            <Box sx={{ display: 'flex', gap: 0.5, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 1, p: 0.5 }}>
              <IconButton
                onClick={() => setView("month")}
                sx={{
                  backgroundColor: view === "month" ? 'white' : 'transparent',
                  color: view === "month" ? '#667eea' : 'white',
                  '&:hover': { backgroundColor: view === "month" ? '#f5f5f5' : 'rgba(255,255,255,0.1)' }
                }}
                size="small"
              >
                <CalendarViewMonthIcon />
              </IconButton>
              <IconButton
                onClick={() => setView("week")}
                sx={{
                  backgroundColor: view === "week" ? 'white' : 'transparent',
                  color: view === "week" ? '#667eea' : 'white',
                  '&:hover': { backgroundColor: view === "week" ? '#f5f5f5' : 'rgba(255,255,255,0.1)' }
                }}
                size="small"
              >
                <ViewWeekIcon />
              </IconButton>
              <IconButton
                onClick={() => setView("day")}
                sx={{
                  backgroundColor: view === "day" ? 'white' : 'transparent',
                  color: view === "day" ? '#667eea' : 'white',
                  '&:hover': { backgroundColor: view === "day" ? '#f5f5f5' : 'rgba(255,255,255,0.1)' }
                }}
                size="small"
              >
                <ViewDayIcon />
              </IconButton>
              <IconButton
                onClick={() => setView("list")}
                sx={{
                  backgroundColor: view === "list" ? 'white' : 'transparent',
                  color: view === "list" ? '#667eea' : 'white',
                  '&:hover': { backgroundColor: view === "list" ? '#f5f5f5' : 'rgba(255,255,255,0.1)' }
                }}
                size="small"
              >
                <ViewListIcon />
              </IconButton>
            </Box>

            {view !== "list" && (
              <>
                <IconButton 
                  onClick={handlePrevious}
                  sx={{ color: 'white', backgroundColor: 'rgba(255,255,255,0.1)' }}
                >
                  <NavigateBeforeIcon />
                </IconButton>
                <IconButton 
                  onClick={handleNext}
                  sx={{ color: 'white', backgroundColor: 'rgba(255,255,255,0.1)' }}
                >
                  <NavigateNextIcon />
                </IconButton>
              </>
            )}

            

            <IconButton 
              onClick={fetchAppointments}
              sx={{ color: 'white', backgroundColor: 'rgba(255,255,255,0.1)' }}
            >
              <RefreshIcon />
            </IconButton>
          </Box>
        </Box>

        {/* LEGEND */}
        <Box sx={{ display: 'flex', gap: 2, mt: 2, flexWrap: 'wrap' }}>
          <Chip 
            label="✅ Completed" 
            size="small" 
            sx={{ backgroundColor: 'rgba(76,175,80,0.2)', color: 'white', fontWeight: 600 }} 
          />
          <Chip 
            label="🔵 Scheduled" 
            size="small" 
            sx={{ backgroundColor: 'rgba(33,150,243,0.2)', color: 'white', fontWeight: 600 }} 
          />
          <Chip 
            label="🟡 Pending" 
            size="small" 
            sx={{ backgroundColor: 'rgba(255,152,0,0.2)', color: 'white', fontWeight: 600 }} 
          />
          <Chip 
            label="🔴 Cancelled" 
            size="small" 
            sx={{ backgroundColor: 'rgba(244,67,54,0.2)', color: 'white', fontWeight: 600 }} 
          />
        </Box>
      </Paper>

      {/* Calendar Views */}
      {view === "month" && renderMonthView()}
      {view === "week" && renderWeekView()}
      {view === "day" && renderDayView()}
      {view === "list" && renderListView()}

      {/* Appointment Details Dialog */}
      <Dialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 2 }
        }}
      >
        {selectedAppointment && (
          <>
            <DialogTitle sx={{ backgroundColor: '#667eea', color: 'white' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  {selectedAppointment.customerName}
                </Typography>
                <IconButton
                  onClick={() => {
                    setDetailsOpen(false);
                    navigate(`/contract/${selectedAppointment.contractId}`);
                  }}
                  sx={{ color: 'white' }}
                  size="small"
                >
                  <EditIcon />
                </IconButton>
              </Box>
            </DialogTitle>
            <DialogContent sx={{ mt: 2 }}>
              <Box sx={{ mb: 2 }}>
                <Chip
                  label={selectedAppointment.status || "Scheduled"}
                  sx={{
                    backgroundColor: getStatusColor(selectedAppointment.status),
                    color: 'white',
                    fontWeight: 700,
                    mb: 2
                  }}
                />
              </Box>

              <Typography variant="body1" sx={{ mb: 1, fontSize: '1.1rem' }}>
                📅 {selectedAppointment.scheduledDate}
              </Typography>
              <Typography variant="body1" sx={{ mb: 1, fontSize: '1.1rem' }}>
                ⏰ {selectedAppointment.startTime} • {selectedAppointment.duration || 120} min
              </Typography>
              <Typography variant="h5" sx={{ mb: 2, color: '#4caf50', fontWeight: 700 }}>
                💰 ${selectedAppointment.amount}
              </Typography>

              <Typography variant="body2" sx={{ mb: 2, fontSize: '1rem' }}>
                {selectedAppointment.description}
              </Typography>

              {selectedAppointment.materials && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Materials: {selectedAppointment.materials}
                </Typography>
              )}

              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<NavigationIcon />}
                  onClick={() =>
                    window.open(
                      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        selectedAppointment.customerAddress ||
                          selectedAppointment.customerName
                      )}`
                    )
                  }
                  sx={{
                    borderColor: '#667eea',
                    color: '#667eea',
                    '&:hover': { borderColor: '#5568d3', backgroundColor: 'rgba(102,126,234,0.1)' }
                  }}
                >
                  Navigate
                </Button>
                {selectedAppointment.customerPhone && (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<PhoneIcon />}
                    onClick={() =>
                      window.open(`tel:${selectedAppointment.customerPhone}`)
                    }
                    sx={{
                      borderColor: '#667eea',
                      color: '#667eea',
                      '&:hover': { borderColor: '#5568d3', backgroundColor: 'rgba(102,126,234,0.1)' }
                    }}
                  >
                    Call
                  </Button>
                )}
              </Box>

              <TextField
                select
                fullWidth
                label="Update Status"
                value={selectedAppointment.status || "Scheduled"}
                onChange={(e) => handleStatusChange(e.target.value)}
                sx={{ mb: 2 }}
              >
                <MenuItem value="Scheduled">Scheduled</MenuItem>
                <MenuItem value="In Progress">In Progress</MenuItem>
                <MenuItem value="Completed">Completed</MenuItem>
                <MenuItem value="Cancelled">Cancelled</MenuItem>
                <MenuItem value="Pending">Pending</MenuItem>
              </TextField>

              {selectedAppointment.contractId && (
                <Button
                  fullWidth
                  variant="outlined"
                  onClick={() => navigate(`/contract/${selectedAppointment.contractId}`)}
                  sx={{ 
                    mb: 1,
                    borderColor: '#667eea',
                    color: '#667eea',
                    '&:hover': { borderColor: '#5568d3', backgroundColor: 'rgba(102,126,234,0.1)' }
                  }}
                >
                  View Contract
                </Button>
              )}
              {selectedAppointment.invoiceId && (
                <Button
                  fullWidth
                  variant="outlined"
                  onClick={() => navigate(`/invoice/${selectedAppointment.invoiceId}`)}
                  sx={{
                    borderColor: '#667eea',
                    color: '#667eea',
                    '&:hover': { borderColor: '#5568d3', backgroundColor: 'rgba(102,126,234,0.1)' }
                  }}
                >
                  View Invoice
                </Button>
              )}
            </DialogContent>
            <DialogActions sx={{ p: 3 }}>
              <Button 
                onClick={handleDelete} 
                color="error" 
                startIcon={<DeleteIcon />}
                variant="outlined"
              >
                Delete
              </Button>
              <Button 
                onClick={() => setDetailsOpen(false)}
                variant="contained"
                sx={{ 
                  backgroundColor: '#667eea', 
                  fontWeight: 600,
                  '&:hover': { backgroundColor: '#5568d3' } 
                }}
              >
                Close
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}