import React, { useState, useEffect } from "react";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./AuthProvider";
import {
  Container,
  Typography,
  Box,
  Paper,
  Card,
  CardContent,
  Grid,
  Chip,
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
import PendingIcon from "@mui/icons-material/Pending";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import moment from "moment";

export default function MyHours() {
  const { user } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [loading, setLoading] = useState(true);
  const [timeEntries, setTimeEntries] = useState([]);

  useEffect(() => {
    loadTimeEntries();
  }, [user]);

  const loadTimeEntries = async () => {
    try {
      const timeEntriesRef = collection(db, "job_time_entries");
      const q = query(
        timeEntriesRef,
        where("crewId", "==", user.uid),
        orderBy("clockIn", "desc")
      );
      
      const entriesSnap = await getDocs(q);
      const entriesData = entriesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTimeEntries(entriesData);
      setLoading(false);
    } catch (error) {
      console.error("Error loading time entries:", error);
      setLoading(false);
    }
  };

  const getThisWeekHours = () => {
    const startOfWeek = moment().startOf('week');
    const endOfWeek = moment().endOf('week');
    
    return timeEntries.filter((entry) => {
      const entryDate = moment(entry.clockIn);
      return entryDate.isBetween(startOfWeek, endOfWeek, null, '[]');
    }).reduce((sum, entry) => sum + (parseFloat(entry.hoursWorked) || 0), 0);
  };

  const getTodayHours = () => {
    const today = moment().format('YYYY-MM-DD');
    
    return timeEntries.filter((entry) => {
      const entryDate = moment(entry.clockIn).format('YYYY-MM-DD');
      return entryDate === today;
    }).reduce((sum, entry) => sum + (parseFloat(entry.hoursWorked) || 0), 0);
  };

  const getPendingHours = () => {
    return timeEntries.filter(e => e.status === 'pending')
      .reduce((sum, entry) => sum + (parseFloat(entry.hoursWorked) || 0), 0);
  };

  const getApprovedHours = () => {
    const startOfWeek = moment().startOf('week');
    const endOfWeek = moment().endOf('week');
    
    return timeEntries.filter((entry) => {
      const entryDate = moment(entry.clockIn);
      return entry.status === 'approved' && entryDate.isBetween(startOfWeek, endOfWeek, null, '[]');
    }).reduce((sum, entry) => sum + (parseFloat(entry.hoursWorked) || 0), 0);
  };

  const getStatusChip = (status) => {
    switch (status) {
      case 'pending':
        return <Chip icon={<PendingIcon />} label="Pending" color="warning" size="small" />;
      case 'approved':
        return <Chip icon={<CheckCircleIcon />} label="Approved" color="success" size="small" />;
      case 'rejected':
        return <Chip icon={<CancelIcon />} label="Rejected" color="error" size="small" />;
      default:
        return <Chip label="Unknown" size="small" />;
    }
  };

  if (loading) {
    return (
      <Container sx={{ mt: 4, textAlign: "center" }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Loading your hours...</Typography>
      </Container>
    );
  }

  return (
    <Container sx={{ mt: 3, pb: 4 }}>
      <Typography variant="h4" gutterBottom>
        📊 My Hours
      </Typography>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Today
              </Typography>
              <Typography variant="h4" color="primary">
                {getTodayHours().toFixed(1)}h
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                This Week
              </Typography>
              <Typography variant="h4" color="info.main">
                {getThisWeekHours().toFixed(1)}h
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ backgroundColor: '#fff3e0' }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Pending Approval
              </Typography>
              <Typography variant="h4" color="warning.main">
                {getPendingHours().toFixed(1)}h
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ backgroundColor: '#e8f5e9' }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Approved (Week)
              </Typography>
              <Typography variant="h4" color="success.main">
                {getApprovedHours().toFixed(1)}h
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Time Entries List */}
      <Paper>
        <Box sx={{ p: 2, borderBottom: '1px solid #e0e0e0' }}>
          <Typography variant="h6">Recent Time Entries</Typography>
        </Box>

        {isMobile ? (
          <Box sx={{ p: 2 }}>
            {timeEntries.length === 0 ? (
              <Typography color="text.secondary" textAlign="center">
                No time entries yet
              </Typography>
            ) : (
              timeEntries.map((entry) => (
                <Card key={entry.id} sx={{ mb: 2 }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="subtitle1" fontWeight="bold">
                        {moment(entry.clockIn).format('ddd, MMM D')}
                      </Typography>
                      {getStatusChip(entry.status)}
                    </Box>
                    
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {entry.jobName}
                    </Typography>
                    
                    <Typography variant="body2">
                      {moment(entry.clockIn).format('h:mm A')} - {entry.clockOut ? moment(entry.clockOut).format('h:mm A') : 'In Progress'}
                    </Typography>
                    
                    <Typography variant="h6" color="primary" sx={{ mt: 1 }}>
                      {entry.hoursWorked ? `${entry.hoursWorked}h` : 'In Progress'}
                    </Typography>

                    {entry.rejectionReason && (
                      <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
                        Reason: {entry.rejectionReason}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                  <TableCell>Date</TableCell>
                  <TableCell>Job</TableCell>
                  <TableCell>Clock In</TableCell>
                  <TableCell>Clock Out</TableCell>
                  <TableCell>Hours</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {timeEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Typography color="text.secondary">No time entries yet</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  timeEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{moment(entry.clockIn).format('ddd, MMM D, YYYY')}</TableCell>
                      <TableCell>{entry.jobName}</TableCell>
                      <TableCell>{moment(entry.clockIn).format('h:mm A')}</TableCell>
                      <TableCell>
                        {entry.clockOut ? moment(entry.clockOut).format('h:mm A') : (
                          <Chip label="In Progress" size="small" color="info" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography fontWeight="bold" color="primary">
                          {entry.hoursWorked ? `${entry.hoursWorked}h` : '--'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {getStatusChip(entry.status)}
                        {entry.rejectionReason && (
                          <Typography variant="caption" color="error" display="block" sx={{ mt: 0.5 }}>
                            {entry.rejectionReason}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Container>
  );
}
