import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Grid,
  Button,
  Chip,
  LinearProgress,
  Alert,
  Container,
  Paper,
  Divider,
  CircularProgress,
  Stack,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  Collapse,
  Tooltip,
} from '@mui/material';
import {
  CalendarToday,
  Build,
  AttachMoney,
  Warning,
  CheckCircle,
  Refresh,
  ArrowForward,
  Assignment,
  Description,
  WorkOutline,
  PersonAdd,
  ExpandMore,
  ExpandLess,
  GpsFixed,
  AccessTime,
  TrendingUp,
  MoneyOff,
} from '@mui/icons-material';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useNavigate, useSearchParams } from 'react-router-dom';
import GoalsSettingsModal from './GoalsSettingsModal';
import WhoIsWorking from './WhoIsWorking';
import LiveCrewWidget from './LiveCrewWidget';

const EnhancedDashboard = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [goalsModalOpen, setGoalsModalOpen] = useState(false);

  // Crew tile expand/collapse state
  const [gpsExpanded, setGpsExpanded] = useState(false);
  const [crewExpanded, setCrewExpanded] = useState(false);

  // Get year from URL or default to current year
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(
    parseInt(searchParams.get('year')) || currentYear
  );

  const [dashboardData, setDashboardData] = useState({
    todayRevenue: 0,
    weekRevenue: 0,
    monthRevenue: 0,
    yearRevenue: 0,
    pendingInvoices: 0,
    pendingCount: 0,
    overdueInvoices: 0,
    overdueCount: 0,
    todaySchedule: [],
    maintenanceAlerts: { overdue: 0, dueSoon: 0, current: 0 },
    pipeline: {
      bidsTotal: 0,
      bidsPending: 0,
      contractsTotal: 0,
      contractsPending: 0,
      contractsSigned: 0,
      jobsScheduled: 0,
      jobsCompleted: 0,
      jobsActive: 0,
    },
    monthlyGoal: 12500,
    annualGoal: 150000,
    activeCrewCount: 0,
    onSiteCount: 0,
  });

  useEffect(() => {
    fetchDashboardData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear]);

  const handleYearChange = (event) => {
    const newYear = event.target.value;
    setSelectedYear(newYear);
    setSearchParams({ year: newYear });
  };

  // Universal date parser
  const parseDate = (doc, fieldNames = ['date', 'createdAt', 'paymentDate', 'invoiceDate', 'startDate', 'contractDate']) => {
    const data = doc.data ? doc.data() : doc;
    for (const field of fieldNames) {
      const val = data[field];
      if (!val) continue;
      if (val.toDate) return val.toDate();
      const parsed = new Date(val);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return null;
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      const goalsDoc = await getDoc(doc(db, 'settings', 'businessGoals'));
      let monthlyGoal = 12500;
      let annualGoal = 150000;
      if (goalsDoc.exists()) {
        const goalsData = goalsDoc.data();
        monthlyGoal = goalsData.monthlyRevenue || 12500;
        annualGoal = goalsData.annualRevenue || 150000;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      endOfMonth.setHours(23, 59, 59, 999);
      const startOfYear = new Date(selectedYear, 0, 1);
      const endOfYear = new Date(selectedYear, 11, 31, 23, 59, 59);

      // ── PAYMENTS ──
      const allPaymentsSnapshot = await getDocs(collection(db, 'payments'));
      const todayRevenue = allPaymentsSnapshot.docs
        .filter(d => { const pd = parseDate(d); return pd && pd >= today && pd < new Date(today.getTime() + 86400000); })
        .reduce((sum, d) => sum + (parseFloat(d.data().amount) || 0), 0);
      const weekRevenue = allPaymentsSnapshot.docs
        .filter(d => { const pd = parseDate(d); return pd && pd >= startOfWeek; })
        .reduce((sum, d) => sum + (parseFloat(d.data().amount) || 0), 0);
      const monthRevenue = allPaymentsSnapshot.docs
        .filter(d => { const pd = parseDate(d); return pd && pd >= startOfMonth && pd <= endOfMonth; })
        .reduce((sum, d) => sum + (parseFloat(d.data().amount) || 0), 0);
      const yearRevenue = allPaymentsSnapshot.docs
        .filter(d => { const pd = parseDate(d); return pd && pd >= startOfYear && pd <= endOfYear; })
        .reduce((sum, d) => sum + (parseFloat(d.data().amount) || 0), 0);

      // ── INVOICES ──
      const allInvoicesSnapshot = await getDocs(collection(db, 'invoices'));
      const pendingInvoicesDocs = allInvoicesSnapshot.docs.filter(d => {
        const status = d.data().status;
        return status && (status.toLowerCase() === 'pending' || status.toLowerCase() === 'sent');
      });
      const pendingInvoices = pendingInvoicesDocs.reduce((sum, d) => sum + (parseFloat(d.data().amount) || 0), 0);
      const pendingCount = pendingInvoicesDocs.length;
      const overdueInvoicesDocs = pendingInvoicesDocs.filter(d => {
        const invoiceDate = parseDate(d);
        if (!invoiceDate) return false;
        return Math.floor((today - invoiceDate) / 86400000) > 30;
      });
      const overdueTotal = overdueInvoicesDocs.reduce((sum, d) => sum + (parseFloat(d.data().amount) || 0), 0);
      const overdueCount = overdueInvoicesDocs.length;

      // ── SCHEDULE ──
      const schedulesSnapshot = await getDocs(collection(db, 'schedules'));
      const todaySchedule = schedulesSnapshot.docs
        .filter(d => { const sd = parseDate(d); return sd && sd >= today && sd < new Date(today.getTime() + 86400000); })
        .map(d => ({ id: d.id, ...d.data(), date: parseDate(d) }))
        .sort((a, b) => a.date - b.date)
        .slice(0, 5);

      // ── MAINTENANCE ──
      const maintenanceSnapshot = await getDocs(query(collection(db, 'maintenance_contracts'), where('status', 'in', ['Active', 'active'])));
      let overdueCount_m = 0, dueSoonCount = 0, currentCount = 0;
      maintenanceSnapshot.docs.forEach(d => {
        const data = d.data();
        let nextVisit = null;
        if (data.nextVisit) {
          if (data.nextVisit.toDate) nextVisit = data.nextVisit.toDate();
          else { const p = new Date(data.nextVisit); if (!isNaN(p.getTime())) nextVisit = p; }
        }
        if (nextVisit) {
          const daysUntil = Math.floor((nextVisit - today) / 86400000);
          if (daysUntil < 0) overdueCount_m++;
          else if (daysUntil <= 7) dueSoonCount++;
          else currentCount++;
        }
      });

      // ── PIPELINE: BIDS ──
      const bidsSnapshot = await getDocs(collection(db, 'bids'));
      const bidsForYear = bidsSnapshot.docs.filter(d => { const bd = parseDate(d); return bd && bd.getFullYear() === selectedYear; });
      const bidsTotal = bidsForYear.length;
      const bidsPending = bidsForYear.filter(d => {
        const data = d.data();
        const status = (data.status || '').toLowerCase();
        if (['accepted', 'cancelled', 'signed'].includes(status)) return false;
        return !(data.clientSignature && data.contractorSignature);
      }).length;

      // ── PIPELINE: CONTRACTS ──
      const contractsSnapshot = await getDocs(collection(db, 'contracts'));
      const contractsForYear = contractsSnapshot.docs.filter(d => { const cd = parseDate(d); return cd && cd.getFullYear() === selectedYear; });
      const contractsTotal = contractsForYear.length;
      const contractsPending = contractsForYear.filter(d => {
        const status = d.data().status;
        return status && ['Pending', 'Sent - Not Signed Yet', 'Sent - Awaiting Client Signature'].includes(status);
      }).length;
      const contractsSigned = contractsForYear.filter(d => {
        const data = d.data();
        return data.signed === true || data.status === 'Signed' || (data.clientSignature && data.contractorSignature);
      }).length;

      // ── PIPELINE: JOBS ──
      const jobsSnapshot = await getDocs(collection(db, 'jobs'));
      const jobsForYear = jobsSnapshot.docs.filter(d => { const jd = parseDate(d); return jd && jd.getFullYear() === selectedYear; });
      const jobsScheduled = jobsForYear.filter(d => {
        const s = d.data().status;
        return s && ['scheduled', 'active'].includes(s.toLowerCase());
      }).length;
      const jobsActive = jobsForYear.filter(d => {
        const s = d.data().status;
        return s && ['pending', 'active', 'in-progress'].includes(s.toLowerCase());
      }).length;
      const monthJobsCompleted = jobsSnapshot.docs.filter(d => {
        const jd = parseDate(d); const s = d.data().status;
        return jd && jd >= startOfMonth && jd <= endOfMonth && s && s.toLowerCase() === 'completed';
      }).length;

      // ── ACTIVE CREW COUNT ──
      const crewSnapshot = await getDocs(query(collection(db, 'job_time_entries'), where('clockOut', '==', null)));
      const activeCrewCount = crewSnapshot.docs.length;
      const onSiteCount = crewSnapshot.docs.filter(d => d.data().gpsDistance !== undefined && d.data().gpsDistance !== null).length;

      setDashboardData({
        todayRevenue, weekRevenue, monthRevenue, yearRevenue,
        pendingInvoices, pendingCount,
        overdueInvoices: overdueTotal, overdueCount,
        todaySchedule,
        maintenanceAlerts: { overdue: overdueCount_m, dueSoon: dueSoonCount, current: currentCount },
        pipeline: { bidsTotal, bidsPending, contractsTotal, contractsPending, contractsSigned, jobsScheduled, jobsCompleted: monthJobsCompleted, jobsActive },
        monthlyGoal, annualGoal,
        activeCrewCount, onSiteCount,
      });

      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount);

  const formatTime = (date) => {
    if (!date) return '';
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const monthProgress = (dashboardData.monthRevenue / dashboardData.monthlyGoal) * 100;
  const yearProgress = (dashboardData.yearRevenue / dashboardData.annualGoal) * 100;

  const yearOptions = [];
  for (let i = 0; i <= 2; i++) yearOptions.push(currentYear - i);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', flexDirection: 'column', gap: 2 }}>
        <CircularProgress size={60} thickness={4} />
        <Typography variant="h6" color="text.secondary">Loading Dashboard...</Typography>
      </Box>
    );
  }

  // ── Maintenance status summary ──
  const maintenanceStatus = dashboardData.maintenanceAlerts.overdue > 0 ? 'error'
    : dashboardData.maintenanceAlerts.dueSoon > 0 ? 'warning' : 'success';
  const maintenanceSummary = dashboardData.maintenanceAlerts.overdue > 0
    ? `🔴 ${dashboardData.maintenanceAlerts.overdue} Overdue`
    : dashboardData.maintenanceAlerts.dueSoon > 0
    ? `🟡 ${dashboardData.maintenanceAlerts.dueSoon} Due This Week`
    : dashboardData.maintenanceAlerts.current > 0
    ? `🟢 ${dashboardData.maintenanceAlerts.current} Current`
    : 'No Active Contracts';

  return (
    <>
      <Container maxWidth="xl" sx={{ mt: 4, mb: 6 }}>

        {/* ══════════════════════════════════════════════════
            1. HERO BANNER
        ══════════════════════════════════════════════════ */}
        <Paper
          elevation={4}
          sx={{
            p: { xs: 2.5, sm: 3 },
            mb: 3,
            background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)',
            color: 'white',
            borderRadius: 3,
            boxShadow: '0 8px 32px rgba(21,101,192,0.4)',
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 0.5 }}>
                <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.5px' }}>
                  🏆 Business Overview
                </Typography>
                <FormControl size="small">
                  <Select
                    value={selectedYear}
                    onChange={handleYearChange}
                    sx={{
                      color: 'white',
                      backgroundColor: 'rgba(255,255,255,0.15)',
                      borderRadius: 2,
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.3)' },
                      '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.6)' },
                      '& .MuiSvgIcon-root': { color: 'white' },
                    }}
                  >
                    {yearOptions.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                  </Select>
                </FormControl>
              </Box>
              <Typography variant="body2" sx={{ opacity: 0.75 }}>
                {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: { xs: 2.5, sm: 4 }, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {[
                { label: 'Today', value: formatCurrency(dashboardData.todayRevenue) },
                { label: 'This Month', value: formatCurrency(dashboardData.monthRevenue) },
                { label: selectedYear === currentYear ? 'YTD' : String(selectedYear), value: formatCurrency(dashboardData.yearRevenue) },
              ].map(item => (
                <Box key={item.label} sx={{ textAlign: 'center' }}>
                  <Typography variant="h4" sx={{ fontWeight: 700 }}>{item.value}</Typography>
                  <Typography variant="caption" sx={{ opacity: 0.8 }}>{item.label}</Typography>
                </Box>
              ))}
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                  {selectedYear === currentYear ? monthProgress.toFixed(0) : yearProgress.toFixed(0)}%
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  {selectedYear === currentYear ? 'Month Goal' : 'Year Goal'}
                </Typography>
                <Box>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setGoalsModalOpen(true)}
                    sx={{ mt: 0.5, color: 'white', borderColor: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', '&:hover': { borderColor: 'white', backgroundColor: 'rgba(255,255,255,0.1)' } }}
                  >
                    ⚙️ Edit Goals
                  </Button>
                </Box>
              </Box>
            </Box>
          </Box>
          <Box sx={{ mt: 2 }}>
            <LinearProgress
              variant="determinate"
              value={Math.min(selectedYear === currentYear ? monthProgress : yearProgress, 100)}
              sx={{ height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.25)', '& .MuiLinearProgress-bar': { backgroundColor: '#fff', borderRadius: 5 } }}
            />
          </Box>
        </Paper>

        {/* ══════════════════════════════════════════════════
            2. QUICK ACTIONS
        ══════════════════════════════════════════════════ */}
        <Card elevation={2} sx={{ mb: 3, borderRadius: 3, border: '1px solid #e8eaf6' }}>
          <CardContent sx={{ pb: '16px !important' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, color: '#1a237e' }}>
              🚀 Quick Actions
            </Typography>

            {/* PRIMARY — 4 main workflow actions */}
            <Box sx={{ display: 'flex', gap: { xs: 1, sm: 1.5 }, flexWrap: 'wrap', mb: 1.5 }}>
              <Button
                variant="contained"
                color="success"
                size="large"
                startIcon={<PersonAdd />}
                onClick={() => navigate('/customer-edit/new')}
                sx={{ fontWeight: 700, borderRadius: 2, boxShadow: '0 4px 12px rgba(76,175,80,0.3)', px: { xs: 2, sm: 3 } }}
              >
                Add Customer
              </Button>
              <Button
                variant="contained"
                color="primary"
                size="large"
                onClick={() => navigate('/create-bid')}
                sx={{ fontWeight: 700, borderRadius: 2, boxShadow: '0 4px 12px rgba(25,118,210,0.3)', px: { xs: 2, sm: 3 } }}
              >
                📋 New Bid
              </Button>
              <Button
                variant="contained"
                size="large"
                onClick={() => navigate('/invoices')}
                sx={{ fontWeight: 700, borderRadius: 2, backgroundColor: '#00897b', boxShadow: '0 4px 12px rgba(0,137,123,0.3)', px: { xs: 2, sm: 3 }, '&:hover': { backgroundColor: '#00695c' } }}
              >
                💵 Quick Weed Invoice
              </Button>
              <Button
                variant="contained"
                color="info"
                size="large"
                onClick={() => navigate('/invoices')}
                sx={{ fontWeight: 700, borderRadius: 2, boxShadow: '0 4px 12px rgba(2,136,209,0.3)', px: { xs: 2, sm: 3 } }}
              >
                💳 Record Payment
              </Button>
            </Box>

            {/* SECONDARY — utility links */}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {[
                { label: '📄 View Invoices', path: '/invoices' },
                { label: '🔧 Maintenance', path: '/maintenance' },
                { label: '👥 Customers', path: '/customers' },
                { label: '📅 Schedule', path: '/schedule-dashboard' },
              ].map(item => (
                <Button
                  key={item.path}
                  variant="outlined"
                  size="small"
                  onClick={() => navigate(item.path)}
                  sx={{ borderRadius: 2, fontWeight: 500, color: '#555', borderColor: '#ddd', '&:hover': { borderColor: '#999', backgroundColor: '#f5f5f5' } }}
                >
                  {item.label}
                </Button>
              ))}
            </Box>
          </CardContent>
        </Card>

        {selectedYear !== currentYear && (
          <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
            📅 Viewing data for <strong>{selectedYear}</strong>. Pipeline data is filtered for this year.
          </Alert>
        )}

        {/* ══════════════════════════════════════════════════
            3. WORK PIPELINE
        ══════════════════════════════════════════════════ */}
        <Card elevation={3} sx={{ mb: 3, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', borderRadius: 3, boxShadow: '0 8px 32px rgba(102,126,234,0.35)' }}>
          <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <Assignment sx={{ fontSize: 36, mr: 1.5 }} />
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                📊 Work Pipeline {selectedYear !== currentYear && `(${selectedYear})`}
              </Typography>
            </Box>

            <Grid container spacing={2}>
              {/* BIDS */}
              <Grid item xs={12} md={4}>
                <Box sx={{ p: 2.5, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2.5, backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.25)', height: '100%' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Description sx={{ fontSize: 28, mr: 1 }} />
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>Bids</Typography>
                  </Box>
                  <Stack spacing={1.5} sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2">📝 Total Bids</Typography>
                      <Chip label={dashboardData.pipeline.bidsTotal} size="small" sx={{ backgroundColor: 'rgba(255,255,255,0.95)', color: '#667eea', fontWeight: 800 }} />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2">⏳ Awaiting Signature</Typography>
                      <Chip label={dashboardData.pipeline.bidsPending} size="small" sx={{ backgroundColor: 'rgba(255,193,7,0.95)', color: '#000', fontWeight: 800 }} />
                    </Box>
                  </Stack>
                  <Button variant="contained" size="small" fullWidth
                    sx={{ backgroundColor: 'rgba(255,255,255,0.95)', color: '#667eea', fontWeight: 700, borderRadius: 2, '&:hover': { backgroundColor: '#fff' } }}
                    onClick={() => navigate('/bids')}
                  >
                    View All Bids
                  </Button>
                </Box>
              </Grid>

              {/* CONTRACTS */}
              <Grid item xs={12} md={4}>
                <Box sx={{ p: 2.5, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2.5, backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.25)', height: '100%' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Description sx={{ fontSize: 28, mr: 1 }} />
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>Contracts</Typography>
                  </Box>
                  <Stack spacing={1.5} sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2">📄 Total Contracts</Typography>
                      <Chip label={dashboardData.pipeline.contractsTotal} size="small" sx={{ backgroundColor: 'rgba(255,255,255,0.95)', color: '#764ba2', fontWeight: 800 }} />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2">⏳ Awaiting Signature</Typography>
                      <Chip label={dashboardData.pipeline.contractsPending} size="small" sx={{ backgroundColor: 'rgba(255,193,7,0.95)', color: '#000', fontWeight: 800 }} />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2">✅ Signed</Typography>
                      <Chip label={dashboardData.pipeline.contractsSigned} size="small" sx={{ backgroundColor: 'rgba(76,175,80,0.95)', color: '#fff', fontWeight: 800 }} />
                    </Box>
                  </Stack>
                  <Button variant="contained" size="small" fullWidth
                    sx={{ backgroundColor: 'rgba(255,255,255,0.95)', color: '#764ba2', fontWeight: 700, borderRadius: 2, '&:hover': { backgroundColor: '#fff' } }}
                    onClick={() => navigate('/contracts')}
                  >
                    View All Contracts
                  </Button>
                </Box>
              </Grid>

              {/* JOBS */}
              <Grid item xs={12} md={4}>
                <Box sx={{ p: 2.5, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2.5, backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.25)', height: '100%' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <WorkOutline sx={{ fontSize: 28, mr: 1 }} />
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>Jobs</Typography>
                  </Box>
                  <Stack spacing={1.5} sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2">📅 Scheduled/Active</Typography>
                      <Chip label={dashboardData.pipeline.jobsScheduled} size="small" sx={{ backgroundColor: 'rgba(33,150,243,0.95)', color: '#fff', fontWeight: 800 }} />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2">✅ Completed (Month)</Typography>
                      <Chip label={dashboardData.pipeline.jobsCompleted} size="small" sx={{ backgroundColor: 'rgba(76,175,80,0.95)', color: '#fff', fontWeight: 800 }} />
                    </Box>
                  </Stack>
                  <Button variant="contained" size="small" fullWidth
                    sx={{ backgroundColor: 'rgba(255,255,255,0.95)', color: '#667eea', fontWeight: 700, borderRadius: 2, '&:hover': { backgroundColor: '#fff' } }}
                    onClick={() => navigate('/jobs')}
                  >
                    View All Jobs
                  </Button>
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* ══════════════════════════════════════════════════
            4. STATUS ROW: Revenue | Money Status | Maintenance
        ══════════════════════════════════════════════════ */}
        <Grid container spacing={3} sx={{ mb: 3 }}>

          {/* REVENUE */}
          <Grid item xs={12} md={4}>
            <Card elevation={2} sx={{ height: '100%', borderRadius: 3, border: '1px solid #e8f5e9', transition: 'transform 0.2s, box-shadow 0.2s', '&:hover': { transform: 'translateY(-3px)', boxShadow: '0 8px 24px rgba(76,175,80,0.15)' } }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Box sx={{ p: 1, backgroundColor: '#e8f5e9', borderRadius: 2, mr: 1.5 }}>
                    <TrendingUp sx={{ color: '#4caf50', fontSize: 28 }} />
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>Revenue</Typography>
                </Box>
                <Stack spacing={1.5}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Today</Typography>
                    <Typography variant="h4" sx={{ fontWeight: 800, color: '#2e7d32', lineHeight: 1.2 }}>{formatCurrency(dashboardData.todayRevenue)}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {dashboardData.todaySchedule.filter(j => j.status === 'Completed').length} jobs completed today
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">This Week</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>{formatCurrency(dashboardData.weekRevenue)}</Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography variant="caption" color="text.secondary">This Month</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>{formatCurrency(dashboardData.monthRevenue)}</Typography>
                      <Typography variant="caption" color="text.secondary">Goal: {formatCurrency(dashboardData.monthlyGoal)}</Typography>
                    </Box>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">{selectedYear === currentYear ? 'Year To Date' : String(selectedYear)}</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>{formatCurrency(dashboardData.yearRevenue)}</Typography>
                    </Box>
                    <Chip
                      label={`${Math.min(selectedYear === currentYear ? monthProgress : yearProgress, 100).toFixed(0)}% of goal`}
                      size="small"
                      color="success"
                      variant="outlined"
                    />
                  </Box>
                </Stack>
                <Button variant="outlined" fullWidth sx={{ mt: 2, borderRadius: 2 }} onClick={() => navigate('/payments-dashboard')} endIcon={<ArrowForward />}>
                  View All Payments
                </Button>
              </CardContent>
            </Card>
          </Grid>

          {/* MONEY STATUS */}
          <Grid item xs={12} md={4}>
            <Card
              elevation={2}
              sx={{
                height: '100%',
                borderRadius: 3,
                border: dashboardData.overdueCount > 0 ? '1px solid #ffcdd2' : '1px solid #fff3e0',
                transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': { transform: 'translateY(-3px)', boxShadow: dashboardData.overdueCount > 0 ? '0 8px 24px rgba(244,67,54,0.15)' : '0 8px 24px rgba(255,152,0,0.15)' },
              }}
            >
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Box sx={{ p: 1, backgroundColor: dashboardData.overdueCount > 0 ? '#ffebee' : '#fff3e0', borderRadius: 2, mr: 1.5 }}>
                    <AttachMoney sx={{ color: dashboardData.overdueCount > 0 ? '#f44336' : '#f57c00', fontSize: 28 }} />
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>Money Status</Typography>
                  {dashboardData.overdueCount > 0 && (
                    <Chip label="OVERDUE" size="small" color="error" sx={{ ml: 'auto', fontWeight: 700, fontSize: '0.65rem' }} />
                  )}
                </Box>

                <Box sx={{ p: 2, backgroundColor: '#fff3e0', borderRadius: 2, mb: 2 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Pending Invoices</Typography>
                  <Typography variant="h4" sx={{ fontWeight: 800, color: '#e65100', lineHeight: 1.2 }}>{formatCurrency(dashboardData.pendingInvoices)}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {dashboardData.pendingCount} invoice{dashboardData.pendingCount !== 1 ? 's' : ''} awaiting payment
                  </Typography>
                </Box>

                {dashboardData.overdueCount > 0 && (
                  <Box sx={{ p: 2, backgroundColor: '#ffebee', borderRadius: 2, mb: 2, border: '1px solid #ffcdd2' }}>
                    <Typography variant="caption" sx={{ color: '#c62828', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>⚠️ Overdue (30+ days)</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 800, color: '#c62828', lineHeight: 1.2 }}>{formatCurrency(dashboardData.overdueInvoices)}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {dashboardData.overdueCount} invoice{dashboardData.overdueCount !== 1 ? 's' : ''} overdue
                    </Typography>
                  </Box>
                )}

                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button variant="contained" color="warning" size="small" sx={{ borderRadius: 2, flex: 1 }} onClick={() => navigate('/invoices')}>
                    View Invoices
                  </Button>
                  <Button variant="outlined" size="small" sx={{ borderRadius: 2, flex: 1 }} onClick={() => navigate('/invoices')}>
                    Record Payment
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* MAINTENANCE */}
          <Grid item xs={12} md={4}>
            <Card
              elevation={2}
              sx={{
                height: '100%',
                borderRadius: 3,
                border: maintenanceStatus === 'error' ? '1px solid #ffcdd2' : maintenanceStatus === 'warning' ? '1px solid #ffe0b2' : '1px solid #e8f5e9',
                transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': { transform: 'translateY(-3px)', boxShadow: '0 8px 24px rgba(255,152,0,0.15)' },
              }}
            >
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Box sx={{ p: 1, backgroundColor: maintenanceStatus === 'error' ? '#ffebee' : '#fff8e1', borderRadius: 2, mr: 1.5 }}>
                    <Build sx={{ color: '#f57c00', fontSize: 28 }} />
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>Maintenance</Typography>
                </Box>
                <Stack spacing={1.5}>
                  {dashboardData.maintenanceAlerts.overdue > 0 && (
                    <Alert severity="error" sx={{ borderRadius: 2, py: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>🔴 {dashboardData.maintenanceAlerts.overdue} Overdue</Typography>
                      <Typography variant="caption">Customers need service ASAP</Typography>
                    </Alert>
                  )}
                  {dashboardData.maintenanceAlerts.dueSoon > 0 && (
                    <Alert severity="warning" sx={{ borderRadius: 2, py: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>🟡 {dashboardData.maintenanceAlerts.dueSoon} Due This Week</Typography>
                      <Typography variant="caption">Schedule these customers soon</Typography>
                    </Alert>
                  )}
                  {dashboardData.maintenanceAlerts.current > 0 && (
                    <Alert severity="success" icon={<CheckCircle />} sx={{ borderRadius: 2, py: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>🟢 {dashboardData.maintenanceAlerts.current} Current</Typography>
                      <Typography variant="caption">All up to date</Typography>
                    </Alert>
                  )}
                  {dashboardData.maintenanceAlerts.overdue === 0 && dashboardData.maintenanceAlerts.dueSoon === 0 && dashboardData.maintenanceAlerts.current === 0 && (
                    <Box sx={{ textAlign: 'center', py: 3 }}>
                      <Typography variant="body2" color="text.secondary">No active maintenance contracts</Typography>
                    </Box>
                  )}
                </Stack>
                <Button variant="outlined" fullWidth sx={{ mt: 2, borderRadius: 2 }} onClick={() => navigate('/maintenance')} endIcon={<ArrowForward />}>
                  Manage Maintenance
                </Button>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* ══════════════════════════════════════════════════
            5. TODAY'S SCHEDULE
        ══════════════════════════════════════════════════ */}
        <Card elevation={2} sx={{ mb: 3, borderRadius: 3, border: '1px solid #e3f2fd' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: dashboardData.todaySchedule.length > 0 ? 2 : 0 }}>
              <Box sx={{ p: 1, backgroundColor: '#e3f2fd', borderRadius: 2, mr: 1.5 }}>
                <CalendarToday sx={{ color: '#1976d2', fontSize: 28 }} />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Today's Schedule
              </Typography>
              <Chip
                label={dashboardData.todaySchedule.length === 0 ? 'No Jobs Today' : `${dashboardData.todaySchedule.length} Job${dashboardData.todaySchedule.length !== 1 ? 's' : ''}`}
                size="small"
                color={dashboardData.todaySchedule.length > 0 ? 'primary' : 'default'}
                sx={{ ml: 1.5, fontWeight: 700 }}
              />
              <Box sx={{ ml: 'auto' }}>
                <Button size="small" variant="outlined" sx={{ borderRadius: 2 }} onClick={() => navigate('/schedule-dashboard')} endIcon={<ArrowForward />}>
                  Full Schedule
                </Button>
              </Box>
            </Box>
            {dashboardData.todaySchedule.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 3 }}>
                <Typography variant="body2" color="text.secondary">No jobs scheduled for today</Typography>
              </Box>
            ) : (
              <Grid container spacing={2}>
                {dashboardData.todaySchedule.map(job => (
                  <Grid item xs={12} sm={6} md={4} key={job.id}>
                    <Box sx={{
                      p: 2, borderRadius: 2,
                      border: '1px solid',
                      borderColor: job.status === 'Completed' ? '#c8e6c9' : '#e3f2fd',
                      backgroundColor: job.status === 'Completed' ? '#f1f8e9' : '#fafcff',
                    }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box>
                          <Typography variant="body1" sx={{ fontWeight: 700 }}>{job.clientName || job.customerName || 'Unknown'}</Typography>
                          <Typography variant="caption" color="text.secondary">{formatTime(job.date)}</Typography>
                        </Box>
                        <Chip
                          label={job.status === 'Completed' ? '✅ Done' : 'Scheduled'}
                          size="small"
                          color={job.status === 'Completed' ? 'success' : 'info'}
                        />
                      </Box>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            )}
          </CardContent>
        </Card>

        {/* ══════════════════════════════════════════════════
            6. CREW TILES — collapsible, side by side
        ══════════════════════════════════════════════════ */}
        <Grid container spacing={3} sx={{ mb: 3 }}>

          {/* GPS STATUS TILE */}
          <Grid item xs={12} md={6}>
            <Card
              elevation={2}
              sx={{
                borderRadius: 3,
                border: '1px solid #e8eaf6',
                overflow: 'hidden',
                boxShadow: gpsExpanded ? '0 8px 24px rgba(102,126,234,0.2)' : undefined,
              }}
            >
              <CardActionArea
                onClick={() => setGpsExpanded(!gpsExpanded)}
                sx={{ p: 0 }}
              >
                <Box sx={{
                  p: 2,
                  display: 'flex',
                  alignItems: 'center',
                  background: gpsExpanded ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'linear-gradient(135deg, #e8eaf6 0%, #ede7f6 100%)',
                  color: gpsExpanded ? 'white' : 'inherit',
                  transition: 'all 0.3s ease',
                }}>
                  <Box sx={{ p: 1, backgroundColor: gpsExpanded ? 'rgba(255,255,255,0.2)' : '#fff', borderRadius: 2, mr: 1.5 }}>
                    <GpsFixed sx={{ color: gpsExpanded ? '#fff' : '#667eea', fontSize: 28 }} />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1 }}>
                      📍 Live GPS Status
                    </Typography>
                    <Typography variant="caption" sx={{ opacity: gpsExpanded ? 0.85 : undefined, color: gpsExpanded ? 'inherit' : 'text.secondary' }}>
                      {dashboardData.onSiteCount} verified on-site · {dashboardData.activeCrewCount} total clocked in
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                      label={dashboardData.onSiteCount}
                      size="small"
                      sx={{
                        backgroundColor: gpsExpanded ? 'rgba(255,255,255,0.25)' : '#e8f5e9',
                        color: gpsExpanded ? '#fff' : '#2e7d32',
                        fontWeight: 800,
                        fontSize: '1rem',
                        height: 32,
                        width: 32,
                      }}
                    />
                    {gpsExpanded ? <ExpandLess sx={{ color: gpsExpanded ? '#fff' : 'inherit' }} /> : <ExpandMore />}
                  </Box>
                </Box>
              </CardActionArea>
              <Collapse in={gpsExpanded} timeout={300}>
                <Box sx={{ p: 0 }}>
                  <LiveCrewWidget />
                </Box>
              </Collapse>
            </Card>
          </Grid>

          {/* WHO'S WORKING TILE */}
          <Grid item xs={12} md={6}>
            <Card
              elevation={2}
              sx={{
                borderRadius: 3,
                border: '1px solid #e8f5e9',
                overflow: 'hidden',
                boxShadow: crewExpanded ? '0 8px 24px rgba(76,175,80,0.2)' : undefined,
              }}
            >
              <CardActionArea
                onClick={() => setCrewExpanded(!crewExpanded)}
                sx={{ p: 0 }}
              >
                <Box sx={{
                  p: 2,
                  display: 'flex',
                  alignItems: 'center',
                  background: crewExpanded ? 'linear-gradient(135deg, #43a047 0%, #1b5e20 100%)' : 'linear-gradient(135deg, #e8f5e9 0%, #f1f8e9 100%)',
                  color: crewExpanded ? 'white' : 'inherit',
                  transition: 'all 0.3s ease',
                }}>
                  <Box sx={{ p: 1, backgroundColor: crewExpanded ? 'rgba(255,255,255,0.2)' : '#fff', borderRadius: 2, mr: 1.5 }}>
                    <AccessTime sx={{ color: crewExpanded ? '#fff' : '#43a047', fontSize: 28 }} />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1 }}>
                      👥 Who's Working
                    </Typography>
                    <Typography variant="caption" sx={{ opacity: crewExpanded ? 0.85 : undefined, color: crewExpanded ? 'inherit' : 'text.secondary' }}>
                      {dashboardData.activeCrewCount} crew member{dashboardData.activeCrewCount !== 1 ? 's' : ''} currently clocked in
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                      label={dashboardData.activeCrewCount}
                      size="small"
                      sx={{
                        backgroundColor: crewExpanded ? 'rgba(255,255,255,0.25)' : '#e8f5e9',
                        color: crewExpanded ? '#fff' : '#2e7d32',
                        fontWeight: 800,
                        fontSize: '1rem',
                        height: 32,
                        width: 32,
                      }}
                    />
                    {crewExpanded ? <ExpandLess sx={{ color: crewExpanded ? '#fff' : 'inherit' }} /> : <ExpandMore />}
                  </Box>
                </Box>
              </CardActionArea>
              <Collapse in={crewExpanded} timeout={300}>
                <Box sx={{ p: 0 }}>
                  <WhoIsWorking maxVisible={4} onViewAll={() => navigate('/approve-time')} />
                </Box>
              </Collapse>
            </Card>
          </Grid>
        </Grid>

        {/* ══════════════════════════════════════════════════
            7. REFRESH
        ══════════════════════════════════════════════════ */}
        <Box sx={{ textAlign: 'center', mt: 2 }}>
          <Tooltip title="Refresh Dashboard">
            <IconButton
              onClick={fetchDashboardData}
              sx={{ backgroundColor: '#f5f5f5', '&:hover': { backgroundColor: '#e0e0e0' } }}
            >
              <Refresh />
            </IconButton>
          </Tooltip>
          <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
            Refresh Dashboard
          </Typography>
        </Box>

      </Container>

      <GoalsSettingsModal
        open={goalsModalOpen}
        onClose={() => setGoalsModalOpen(false)}
        onSave={fetchDashboardData}
      />
    </>
  );
};

export default EnhancedDashboard;