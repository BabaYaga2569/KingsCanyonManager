import React, { useState, useEffect } from "react";
import { collection, addDoc, getDocs, query, where, orderBy, updateDoc, doc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./AuthProvider";
import {
  Container,
  Typography,
  Box,
  Paper,
  Button,
  TextField,
  MenuItem,
  Card,
  CardContent,
  Chip,
  CircularProgress,
} from "@mui/material";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import moment from "moment";
import Swal from "sweetalert2";
import { notifyCrewClockIn, notifyCrewClockOut } from './pushoverNotificationService';

export default function TimeClock() {
  const { user, userRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState("");
  const [clockedIn, setClockedIn] = useState(false);
  const [currentEntry, setCurrentEntry] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [todayHours, setTodayHours] = useState(0);
  const [employeeInfo, setEmployeeInfo] = useState(null); // ✅ NEW: Store employee info

  useEffect(() => {
    loadData();
  }, [user]);

  useEffect(() => {
    let interval;
    if (clockedIn && currentEntry) {
      interval = setInterval(() => {
        const start = moment(currentEntry.clockIn);
        const now = moment();
        setElapsedTime(now.diff(start, 'seconds'));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [clockedIn, currentEntry]);

  // ✅ NEW: Load employee info from users collection
  const loadEmployeeInfo = async () => {
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Find employee by email
      const employee = users.find(u => u.email === user.email);
      
      if (employee) {
        console.log("✅ Found employee:", employee.name);
        setEmployeeInfo(employee);
      } else {
        console.log("⚠️ No employee record for:", user.email);
        setEmployeeInfo({
          name: user.displayName || user.email,
          email: user.email,
        });
      }
    } catch (error) {
      console.error("Error loading employee info:", error);
      setEmployeeInfo({
        name: user.displayName || user.email,
        email: user.email,
      });
    }
  };


  const loadData = async () => {
    try {
      // ✅ CHANGE 1: Load employee info first
      await loadEmployeeInfo();
      
      // Load jobs
      const jobsSnap = await getDocs(collection(db, "jobs"));
      const jobsData = jobsSnap.docs.map((d) => {
        const data = d.data();
        
        // Get client name (check multiple field names for compatibility)
        const clientName = data.clientName || data.customerName || "Unknown Client";
        
        // Build a short job type label from description/jobType
        let shortType = "";
        const desc = (data.description || data.jobDescription || data.jobType || "").toLowerCase();
        if (desc.includes("weed")) shortType = "Weed";
        else if (desc.includes("landscape") || desc.includes("landscaping")) shortType = "Landscape";
        else if (desc.includes("maint")) shortType = "Maint.";
        else if (desc.includes("clean")) shortType = "Cleanup";
        else if (desc.includes("trim")) shortType = "Trimming";
        else if (desc.includes("irrig")) shortType = "Irrigation";
        else if (desc.includes("tree")) shortType = "Tree";
        else if (desc.includes("rock") || desc.includes("gravel")) shortType = "Rock/Gravel";
        else if (desc.includes("fence")) shortType = "Fence";
        else if (desc.includes("haul")) shortType = "Hauling";
        else if (data.jobType) shortType = data.jobType.substring(0, 12);
        else if (data.description) shortType = data.description.substring(0, 12);
        
        // Get a short date from serviceDate, startDate, or createdAt
        let shortDate = "";
        const dateSource = data.serviceDate || data.startDate || data.createdAt;
        if (dateSource) {
          const d2 = dateSource.toDate ? dateSource.toDate() : new Date(dateSource);
          if (!isNaN(d2.getTime())) {
            shortDate = `${d2.getMonth() + 1}/${d2.getDate()}`;
          }
        }
        
        // Build display: "John Smith — Weed (2/10)"
        let displayName = clientName;
        if (shortType && shortDate) displayName += ` — ${shortType} (${shortDate})`;
        else if (shortType) displayName += ` — ${shortType}`;
        else if (shortDate) displayName += ` (${shortDate})`;
        
        return { 
          id: d.id, 
          ...data,
          clientName: clientName,
          displayName: displayName
        };
      });
      
      // Sort jobs alphabetically by client name for easy finding
      jobsData.sort((a, b) => {
        const nameA = (a.clientName || "").toUpperCase();
        const nameB = (b.clientName || "").toUpperCase();
        return nameA.localeCompare(nameB);
      });
      
      // Add special service options at the top
      const specialServices = [
        {
          id: "weed-service",
          displayName: "Weed Extraction Service",
          clientName: "Weed Extraction Service",
          isSpecialService: true
        },
        {
          id: "maintenance-service", 
          displayName: "Maintenance Service",
          clientName: "Maintenance Service",
          isSpecialService: true
        }
      ];
      
      // Combine: special services first, then regular jobs
      const allJobs = [...specialServices, ...jobsData];
      
      console.log("Loaded jobs:", allJobs); // DEBUG
      setJobs(allJobs);

      // ✅ CRITICAL FIX: Auto-close old zombie entries BEFORE checking current status
      console.log("🔍 Checking for zombie entries...");
      const timeEntriesRef = collection(db, "job_time_entries");
      const openEntriesQuery = query(
        timeEntriesRef,
        where("crewId", "==", user.uid),
        where("clockOut", "==", null)
      );
      const allOpenEntries = await getDocs(openEntriesQuery);
      
      // Find entries older than 12 hours
      const twelveHoursAgo = Date.now() - (12 * 60 * 60 * 1000);
      const zombieEntries = [];
      let currentOpenEntry = null;
      
      allOpenEntries.docs.forEach((docSnap) => {
        const entry = { id: docSnap.id, ...docSnap.data() };
        const clockInTime = new Date(entry.clockIn).getTime();
        
        if (clockInTime < twelveHoursAgo) {
          // Old zombie entry - needs auto-close
          zombieEntries.push(entry);
          console.log(`🧹 Found zombie entry from ${entry.clockIn} - will auto-close`);
        } else {
          // Recent entry (within last 12 hours) - this is the current one
          currentOpenEntry = entry;
        }
      });
      
      // Auto-close zombie entries
      if (zombieEntries.length > 0) {
        console.log(`🧹 Auto-closing ${zombieEntries.length} zombie entries...`);
        for (const zombie of zombieEntries) {
          console.log(`🧹 Auto-closing zombie entry: ${zombie.id} from ${zombie.clockIn}`);
          await updateDoc(doc(db, "job_time_entries", zombie.id), {
            clockOut: zombie.clockIn, // Set to same time = 0 hours worked
            hoursWorked: 0,
            status: "auto_closed",
            updatedAt: new Date().toISOString(),
            autoClosedReason: "Entry older than 12 hours without clock out"
          });
        }
        console.log("✅ Zombie cleanup complete!");
      } else {
        console.log("✅ No zombie entries found");
      }
      
      // Now check for legitimate current entry
      if (currentOpenEntry) {
        console.log("✅ Found current open entry:", currentOpenEntry);
        setCurrentEntry(currentOpenEntry);
        setClockedIn(true);
        setSelectedJob(currentOpenEntry.jobId);
      } else {
        console.log("✅ No open entries - user is clocked out");
        setClockedIn(false);
        setCurrentEntry(null);
      }

      // Load today's total hours
      await loadTodayHours();

      setLoading(false);
    } catch (error) {
      console.error("Error loading data:", error);
      setLoading(false);
    }
  };
  const loadTodayHours = async () => {
    try {
      const todayStart = moment().startOf('day').toISOString();
      const todayEnd = moment().endOf('day').toISOString();
      
      const timeEntriesRef = collection(db, "job_time_entries");
      const q = query(
        timeEntriesRef,
        where("crewId", "==", user.uid),
        where("clockIn", ">=", todayStart),
        where("clockIn", "<=", todayEnd)
      );
      
      const entriesSnap = await getDocs(q);
      let total = 0;
      
      entriesSnap.docs.forEach((doc) => {
        const entry = doc.data();
        if (entry.hoursWorked) {
          total += parseFloat(entry.hoursWorked);
        }
      });
      
      setTodayHours(total);
    } catch (error) {
      console.error("Error loading today's hours:", error);
    }
  };

  const handleClockIn = async () => {
    if (!selectedJob) {
      Swal.fire("Error", "Please select a job first", "warning");
      return;
    }

    try {
      const job = jobs.find(j => j.id === selectedJob);
      const now = new Date().toISOString();

      // ✅ CHANGE 2: Use employee name from users collection!
      const employeeName = employeeInfo?.name || user.displayName || user.email;

      const entryData = {
        crewId: user.uid,
        crewName: employeeName, // ✅ FIXED: Real employee name!
        crewEmail: user.email, // ✅ NEW: Store email separately
        jobId: selectedJob,
        jobName: job?.displayName || "Unknown Job",
        jobDescription: job?.description || job?.jobDescription || job?.jobType || job?.displayName || "No description",
        clientName: job?.clientName || "",
        clockIn: now,
        clockOut: null,
        hoursWorked: null,
        status: "pending",
        createdAt: now,
      };

      console.log("✅ Clocking in as:", employeeName); // DEBUG

      const docRef = await addDoc(collection(db, "job_time_entries"), entryData);
      
      setCurrentEntry({ id: docRef.id, ...entryData });
      setClockedIn(true);

      // Send SMS notification
      try {
        await notifyCrewClockIn(
          { id: user.uid, name: employeeName, email: user.email },
          now,
          { id: selectedJob, name: job?.displayName || "Unknown Job", clientName: job?.clientName || job?.displayName }
        );
      } catch (smsError) {
        console.error('Error sending clock in notification:', smsError);
      }

      Swal.fire({
        icon: "success",
        title: "Clocked In!",
        text: `Started work on ${job?.displayName || "job"}`,
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error("Error clocking in:", error);
      Swal.fire("Error", "Failed to clock in", "error");
    }
  };

  const handleClockOut = async () => {
    if (!currentEntry) return;

    try {
      const now = new Date().toISOString();
      const clockInTime = moment(currentEntry.clockIn);
      const clockOutTime = moment(now);
      const hours = clockOutTime.diff(clockInTime, 'hours', true);

      await updateDoc(doc(db, "job_time_entries", currentEntry.id), {
        clockOut: now,
        hoursWorked: parseFloat(hours.toFixed(2)),
        updatedAt: now,
      });

      setClockedIn(false);
      setCurrentEntry(null);
      setElapsedTime(0);
      setSelectedJob("");
      
      await loadTodayHours();

      // Send SMS notification
      try {
        const employeeName = currentEntry.crewName || user.displayName || user.email;
        await notifyCrewClockOut(
          { id: user.uid, name: employeeName, email: user.email },
          currentEntry.clockIn,
          now,
          { id: currentEntry.jobId, name: currentEntry.jobName || "Unknown Job", clientName: currentEntry.jobName }
        );
      } catch (smsError) {
        console.error('Error sending clock out notification:', smsError);
      }

      Swal.fire({
        icon: "success",
        title: "Clocked Out!",
        html: `
          <p>You worked <strong>${hours.toFixed(2)} hours</strong></p>
          <p>Your time is pending approval</p>
        `,
        timer: 3000,
      });
    } catch (error) {
      console.error("Error clocking out:", error);
      Swal.fire("Error", "Failed to clock out", "error");
    }
  };

  const formatElapsedTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  if (loading) {
    return (
      <Container sx={{ mt: 4, textAlign: "center" }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Loading...</Typography>
      </Container>
    );
  }

  return (
    <Container sx={{ mt: 3, pb: 4, maxWidth: 'sm' }}>
      <Typography variant="h4" gutterBottom sx={{ textAlign: 'center', mb: 3 }}>
        Time Clock
      </Typography>

      {/* ✅ CHANGE 3: Show employee name */}
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 2 }}>
        Welcome, {employeeInfo?.name || user.displayName || user.email}
      </Typography>

      {/* Today's Summary */}
      <Card sx={{ mb: 3, backgroundColor: '#e3f2fd' }}>
        <CardContent>
          <Typography variant="h6" color="primary" gutterBottom>
            Today's Hours
          </Typography>
          <Typography variant="h3" color="primary">
            {todayHours.toFixed(1)}h
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {moment().format('dddd, MMMM D, YYYY')}
          </Typography>
        </CardContent>
      </Card>

      {/* Clock Status */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h6" gutterBottom>
            {clockedIn ? (
              <Chip 
                icon={<AccessTimeIcon />} 
                label="CLOCKED IN" 
                color="success" 
                sx={{ fontSize: '1rem', py: 2 }}
              />
            ) : (
              <Chip 
                label="NOT CLOCKED IN" 
                color="default" 
                sx={{ fontSize: '1rem', py: 2 }}
              />
            )}
          </Typography>

          {clockedIn && currentEntry && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Clocked in at: {moment(currentEntry.clockIn).format('h:mm A')}
              </Typography>
              <Typography variant="h4" color="primary" sx={{ mt: 1 }}>
                {formatElapsedTime(elapsedTime)}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Working on: {currentEntry.jobName}
              </Typography>
            </Box>
          )}
        </Box>
      </Paper>

      {/* Clock In/Out Controls */}
      <Paper sx={{ p: 3 }}>
        {!clockedIn ? (
          <Box>
            <Typography variant="h6" gutterBottom>
              Select Job
            </Typography>
            
            {jobs.length === 0 ? (
              <Typography color="error" sx={{ mb: 2 }}>
                No jobs available. Contact your manager.
              </Typography>
            ) : (
              <TextField
                select
                fullWidth
                value={selectedJob}
                onChange={(e) => setSelectedJob(e.target.value)}
                sx={{ mb: 2 }}
              >
                <MenuItem value="">-- Select a Job --</MenuItem>
                {jobs.map((job) => (
                  <MenuItem key={job.id} value={job.id}>
                    {job.displayName}
                  </MenuItem>
                ))}
              </TextField>
            )}

            <Button
              fullWidth
              variant="contained"
              color="success"
              size="large"
              onClick={handleClockIn}
              disabled={!selectedJob || jobs.length === 0}
              startIcon={<AccessTimeIcon />}
              sx={{ py: 2, fontSize: '1.1rem' }}
            >
              CLOCK IN
            </Button>
          </Box>
        ) : (
          <Button
            fullWidth
            variant="contained"
            color="error"
            size="large"
            onClick={handleClockOut}
            startIcon={<CheckCircleIcon />}
            sx={{ py: 2, fontSize: '1.1rem' }}
          >
            CLOCK OUT
          </Button>
        )}
      </Paper>

      {/* Instructions */}
      <Paper sx={{ p: 2, mt: 3, backgroundColor: '#f5f5f5' }}>
        <Typography variant="subtitle2" gutterBottom fontWeight="bold">
          Instructions:
        </Typography>
        <Typography variant="body2">
          1. Select the job you're working on<br/>
          2. Click "CLOCK IN" when you start work<br/>
          3. Click "CLOCK OUT" when you're done<br/>
          4. Your hours will be sent for approval
        </Typography>
      </Paper>
    </Container>
  );
}