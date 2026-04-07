// AuditLog.jsx
// Admin/God only — full audit trail of app actions
import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from './firebase';
import {
  Box, Typography, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, TextField,
  MenuItem, Select, FormControl, InputLabel, Button,
  CircularProgress, InputAdornment, useTheme, useMediaQuery,
  Card, CardContent,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';
import FilterListIcon from '@mui/icons-material/FilterList';
import moment from 'moment';

// Action label + color mapping
const ACTION_META = {
  bid_created:          { label: 'Bid Created',          color: 'success' },
  bid_updated:          { label: 'Bid Updated',          color: 'info' },
  bid_archived:         { label: 'Bid Archived',         color: 'warning' },
  bid_restored:         { label: 'Bid Restored',         color: 'info' },
  bid_deleted:          { label: 'Bid Deleted',          color: 'error' },
  bid_contract_created: { label: 'Contract from Bid',    color: 'success' },
  bid_email_sent:       { label: 'Bid Emailed',          color: 'info' },
  contract_updated:     { label: 'Contract Updated',     color: 'info' },
  contract_signed:      { label: 'Contract Signed',      color: 'success' },
  contract_cancelled:   { label: 'Contract Cancelled',   color: 'error' },
  contract_email_sent:  { label: 'Contract Emailed',     color: 'info' },
  job_status_changed:   { label: 'Job Status Changed',   color: 'warning' },
  job_type_changed:     { label: 'Job Type Changed',     color: 'info' },
  job_updated:          { label: 'Job Updated',          color: 'info' },
  job_deleted:          { label: 'Job Deleted',          color: 'error' },
  job_completed:        { label: 'Job Completed',        color: 'success' },
  expense_created:      { label: 'Expense Added',        color: 'success' },
  expense_updated:      { label: 'Expense Updated',      color: 'info' },
  expense_deleted:      { label: 'Expense Deleted',      color: 'error' },
  payment_created:      { label: 'Payment Recorded',     color: 'success' },
  payment_deleted:      { label: 'Payment Deleted',      color: 'error' },
  employee_invited:     { label: 'Employee Invited',     color: 'success' },
  employee_updated:     { label: 'Employee Updated',     color: 'info' },
  employee_deactivated: { label: 'Employee Deactivated', color: 'error' },
  employee_activated:   { label: 'Employee Activated',   color: 'success' },
  employee_deleted:     { label: 'Employee Deleted',     color: 'error' },
  invite_cancelled:     { label: 'Invite Cancelled',     color: 'warning' },
  invoice_email_sent:   { label: 'Invoice Emailed',      color: 'info' },
  invoice_status_changed: { label: 'Invoice Status',     color: 'warning' },
};

const CATEGORY_MAP = {
  'All':       null,
  'Bids':      ['bid_created','bid_updated','bid_archived','bid_restored','bid_deleted','bid_contract_created','bid_email_sent'],
  'Contracts': ['contract_updated','contract_signed','contract_cancelled','contract_email_sent'],
  'Jobs':      ['job_status_changed','job_type_changed','job_updated','job_deleted','job_completed'],
  'Expenses':  ['expense_created','expense_updated','expense_deleted'],
  'Payments':  ['payment_created','payment_deleted'],
  'Employees': ['employee_invited','employee_updated','employee_deactivated','employee_activated','employee_deleted','invite_cancelled'],
  'Invoices':  ['invoice_email_sent','invoice_status_changed'],
};

function formatDetails(action, details) {
  if (!details) return '—';
  const d = details;
  switch (action) {
    case 'bid_updated':
    case 'bid_created':
      return `${d.clientName || ''}${d.amount ? ` · $${parseFloat(d.amount).toFixed(2)}` : ''}`;
    case 'bid_email_sent':
    case 'contract_email_sent':
    case 'invoice_email_sent':
      return `To: ${d.emailTo || d.email || ''}`;
    case 'contract_updated':
      return `${d.clientName || ''}${d.amount ? ` · $${parseFloat(d.amount).toFixed(2)}` : ''}`;
    case 'job_status_changed':
      return `${d.clientName || ''} · ${d.oldStatus || '?'} → ${d.newStatus || '?'}`;
    case 'job_type_changed':
      return `${d.clientName || ''} · ${d.newJobType || ''}`;
    case 'job_deleted':
      return d.clientName || '';
    case 'expense_created':
    case 'expense_updated':
    case 'expense_deleted':
      return `${d.vendor || ''}${d.amount ? ` · $${parseFloat(d.amount).toFixed(2)}` : ''}${d.jobName ? ` · ${d.jobName}` : ''}`;
    case 'payment_created':
    case 'payment_deleted':
      return `${d.clientName || ''}${d.amount ? ` · $${parseFloat(d.amount).toFixed(2)}` : ''}`;
    case 'employee_invited':
    case 'employee_updated':
    case 'employee_activated':
    case 'employee_deactivated':
    case 'employee_deleted':
      return `${d.employeeName || ''}${d.email ? ` · ${d.email}` : ''}`;
    case 'invite_cancelled':
      return `${d.inviteeName || ''} · ${d.inviteeEmail || ''}`;
    default:
      return Object.entries(d).filter(([k]) => !['id','Id'].some(s => k.endsWith(s))).map(([k,v]) => `${v}`).join(' · ');
  }
}

export default function AuditLog() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [userFilter, setUserFilter] = useState('all');
  const [startDate, setStartDate] = useState(moment().subtract(30, 'days').format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(moment().format('YYYY-MM-DD'));

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'audit_log'), orderBy('timestamp', 'desc'), limit(500));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setLogs(data);
    } catch (err) {
      console.error('Error loading audit log:', err);
    } finally {
      setLoading(false);
    }
  };

  // Get unique users for filter
  const uniqueUsers = ['all', ...new Set(logs.map(l => l.userName).filter(Boolean))];

  // Apply filters
  const filtered = logs.filter(log => {
    const ts = moment(log.timestamp);
    const inRange = ts.isSameOrAfter(startDate, 'day') && ts.isSameOrBefore(endDate, 'day');
    const matchesCategory = category === 'All' || (CATEGORY_MAP[category] || []).includes(log.action);
    const matchesUser = userFilter === 'all' || log.userName === userFilter;
    const matchesSearch = !search.trim() ||
      (log.userName || '').toLowerCase().includes(search.toLowerCase()) ||
      (log.action || '').toLowerCase().includes(search.toLowerCase()) ||
      JSON.stringify(log.details || {}).toLowerCase().includes(search.toLowerCase());
    return inRange && matchesCategory && matchesUser && matchesSearch;
  });

  const handleExport = () => {
    const rows = [
      ['Timestamp', 'User', 'Role', 'Action', 'Details'].join(','),
      ...filtered.map(l => [
        `"${moment(l.timestamp).format('YYYY-MM-DD HH:mm:ss')}"`,
        `"${l.userName || ''}"`,
        `"${l.userRole || ''}"`,
        `"${ACTION_META[l.action]?.label || l.action}"`,
        `"${formatDetails(l.action, l.details)}"`,
      ].join(',')),
    ].join('\n');
    const blob = new Blob([rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_log_${moment().format('YYYY-MM-DD')}.csv`;
    a.click();
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight="bold">📋 Audit Log</Typography>
          <Typography variant="body2" color="text.secondary">
            Full history of all actions taken in the app
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport} disabled={filtered.length === 0}>
          Export CSV ({filtered.length})
        </Button>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder="Search user, action, details…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            sx={{ minWidth: 220 }}
          />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Category</InputLabel>
            <Select value={category} label="Category" onChange={e => setCategory(e.target.value)}>
              {Object.keys(CATEGORY_MAP).map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>User</InputLabel>
            <Select value={userFilter} label="User" onChange={e => setUserFilter(e.target.value)}>
              {uniqueUsers.map(u => <MenuItem key={u} value={u}>{u === 'all' ? 'All Users' : u}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField size="small" type="date" label="From" value={startDate}
            onChange={e => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 145 }} />
          <TextField size="small" type="date" label="To" value={endDate}
            onChange={e => setEndDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 145 }} />
          <Button size="small" startIcon={<FilterListIcon />} onClick={fetchLogs} variant="outlined">
            Refresh
          </Button>
        </Box>
      </Paper>

      {loading ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <CircularProgress />
          <Typography sx={{ mt: 2 }} color="text.secondary">Loading audit log...</Typography>
        </Box>
      ) : filtered.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="h6" color="text.secondary">No entries found</Typography>
          <Typography variant="body2" color="text.secondary">Try adjusting your filters or date range</Typography>
        </Box>
      ) : isMobile ? (
        // Mobile cards
        filtered.map(log => {
          const meta = ACTION_META[log.action] || { label: log.action, color: 'default' };
          return (
            <Card key={log.id} sx={{ mb: 1.5 }}>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 0.5 }}>
                  <Chip label={meta.label} color={meta.color} size="small" />
                  <Typography variant="caption" color="text.secondary">
                    {moment(log.timestamp).format('MMM D, h:mm a')}
                  </Typography>
                </Box>
                <Typography variant="body2" fontWeight="bold">{log.userName || '—'}</Typography>
                <Typography variant="caption" color="text.secondary">{formatDetails(log.action, log.details)}</Typography>
              </CardContent>
            </Card>
          );
        })
      ) : (
        // Desktop table
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                <TableCell><strong>Timestamp</strong></TableCell>
                <TableCell><strong>User</strong></TableCell>
                <TableCell><strong>Role</strong></TableCell>
                <TableCell><strong>Action</strong></TableCell>
                <TableCell><strong>Details</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map(log => {
                const meta = ACTION_META[log.action] || { label: log.action, color: 'default' };
                return (
                  <TableRow key={log.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Typography variant="body2">{moment(log.timestamp).format('MMM D, YYYY')}</Typography>
                      <Typography variant="caption" color="text.secondary">{moment(log.timestamp).format('h:mm:ss a')}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">{log.userName || '—'}</Typography>
                      <Typography variant="caption" color="text.secondary">{log.userEmail || ''}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={log.userRole || '—'} size="small" variant="outlined"
                        color={log.userRole === 'god' ? 'error' : log.userRole === 'admin' ? 'warning' : 'default'} />
                    </TableCell>
                    <TableCell>
                      <Chip label={meta.label} color={meta.color} size="small" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {formatDetails(log.action, log.details)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}