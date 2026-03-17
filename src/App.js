// COMPLETE APP.JS - WITH SORTING ON BIDS LIST + NOTES MANAGER
// Supports CREW, ADMIN, and GOD roles
// Crew members see limited menu and are redirected to Time Clock
// Now includes sorting dropdown for Bids List!
// ADDED: Notes Manager for tracking customer requests, materials, and tasks

import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  ButtonGroup,
  Container,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemText,
  Box,
  useMediaQuery,
  useTheme,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Badge,
  Chip,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import LogoutIcon from "@mui/icons-material/Logout";
import SortIcon from "@mui/icons-material/Sort";
import DownloadIcon from "@mui/icons-material/Download";
import DescriptionIcon from "@mui/icons-material/Description";
import Swal from "sweetalert2";
import { db } from "./firebase";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
// Import AuthProvider
import { AuthProvider, useAuth } from "./AuthProvider";

// Import notification counts hook
import { useNotificationCounts, markAsViewed } from "./useNotificationCounts";

import ContractsDashboard from "./ContractsDashboard";
import CreateBid from "./CreateBid";
import ExpenseRepairTool from './ExpenseRepairTool';
import ContractEditor from "./ContractEditor";
import Dashboard from "./Dashboard";
import EnhancedDashboard from './EnhancedDashboard';
import InvoicesDashboard from "./InvoicesDashboard";
import InvoiceEditor from "./InvoiceEditor";
import JobsManager from "./JobsManager";
import CustomersDashboard from "./CustomersDashboard";
import CustomerProfile from "./CustomerProfile";
import CustomerEditor from "./CustomerEditor";
import ScheduleJob from "./ScheduleJob";
import ScheduleDashboard from "./ScheduleDashboard";
import CalendarView from "./CalendarView";
// ========================================
// 🔒 CRITICAL: MAINTENANCE COMPONENTS - DO NOT REMOVE
// If these are missing, the Maintenance tab won't work!
// ========================================
import MaintenanceDashboard from "./MaintenanceDashboard";
import MaintenanceEditor from "./MaintenanceEditor";
// ========================================
import PaymentTracker from "./PaymentTracker";
import PaymentsDashboard from "./PaymentsDashboard";
import CrewManager from "./CrewManager";
import EquipmentManager from "./EquipmentManager";
import NDAEditor from "./NDAEditor";
import NDASigningPage from "./NDASigningPage";
import NDASigning from "./NDASigning"; // NEW: Employee first-login NDA
import ExpensesManager from "./ExpensesManager";
import IntegratedPayroll from "./IntegratedPayroll"; // ✅ CHANGED: New integrated payroll system
import CrewPaymentHistory from "./CrewPaymentHistory";
import TaxReport from "./TaxReport";
import JimSlayerExpenseFix from './JimSlayerExpenseFix';
import MigrationPage from './MigrationPage';
import MigrationDashboard from './MigrationDashboard';  // ← ADD THIS LINE
import JobExpenses from "./JobExpenses";
import NotesManager from "./NotesManager"; // â† ADDED: Notes Manager
import NotificationSettings from "./NotificationSettings"; // NEW: SMS Notification Settings
import EmployeeAccountManager from './EmployeeAccountManager';
import { createFullJobPackage } from "./utils/createFullJobPackage";
import { exportBidsToExcel, exportBidToWord, exportAllBidsToWord } from "./utils/exportUtils";
import generateBidPDF from "./pdf/generateBidPDF";
import ContractSigningPage from "./ContractSigningPage";
import BidSigningPage from './BidSigningPage';
import PaymentPortal from "./PaymentPortal";
import BidEditor from "./BidEditor";

// REFRESH SYSTEM IMPORTS
import UpdateNotification from "./UpdateNotification";
import RefreshButton from "./RefreshButton";
import VersionDisplay from "./VersionDisplay";

// TIME CLOCK IMPORTS
import TimeClock from "./TimeClock";
import MyHours from "./MyHours";
import ApproveTime from "./ApproveTime";
import UserProfile from "./UserProfile"; // User profile and password change


// --------------------- BIDS LIST WITH SORTING ---------------------
function BidsList() {  
  const [bids, setBids] = useState([]);
  const [sortedBids, setSortedBids] = useState([]);
  const [sortOrder, setSortOrder] = useState("newest");
  const [logoDataUrl, setLogoDataUrl] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        setLogoDataUrl(canvas.toDataURL("image/png"));
      } catch (e) {
        console.warn("Logo loading failed:", e);
        setLogoDataUrl(null);
      }
    };
    img.src = "/logo-kcl.png";
  }, []);

  useEffect(() => {
    const fetchBids = async () => {
      const querySnapshot = await getDocs(collection(db, "bids"));
      const bidsData = querySnapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setBids(bidsData);
    };
    fetchBids();
  }, []);

  useEffect(() => {
    markAsViewed('bids');
  }, []);

  // Sort bids whenever bids, sortOrder, or showArchived changes
  useEffect(() => {
    const filtered = bids.filter(b =>
      showArchived ? b.status === 'archived' : b.status !== 'archived'
    );
    const sorted = [...filtered].sort((a, b) => {
      switch (sortOrder) {
        case "newest":
          return new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0);
        case "oldest":
          return new Date(a.createdAt || a.date || 0) - new Date(b.createdAt || b.date || 0);
        case "name-asc":
          return (a.customerName || "").localeCompare(b.customerName || "");
        case "name-desc":
          return (b.customerName || "").localeCompare(a.customerName || "");
        case "amount-high":
          return parseFloat(b.amount || 0) - parseFloat(a.amount || 0);
        case "amount-low":
          return parseFloat(a.amount || 0) - parseFloat(b.amount || 0);
        default:
          return 0;
      }
    });
    setSortedBids(sorted);
  }, [bids, sortOrder, showArchived]);

  // Days since last edit
  const daysSinceEdit = (bid) => {
    const ref = bid.updatedAt || bid.createdAt || bid.date;
    if (!ref) return null;
    return Math.floor((Date.now() - new Date(ref).getTime()) / 86400000);
  };

  const handleDelete = async (bid) => {
    const confirm = await Swal.fire({
      title: `Delete bid for ${bid.customerName}?`,
      text: "This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });
    if (confirm.isConfirmed) {
      await deleteDoc(doc(db, "bids", bid.id));
      setBids(bids.filter((b) => b.id !== bid.id));
      Swal.fire("Deleted!", "Bid has been removed.", "success");
    }
  };

  const handleArchive = async (bid) => {
    await updateDoc(doc(db, "bids", bid.id), {
      status: 'archived',
      archivedAt: new Date().toISOString(),
      archivedBy: 'manual',
    });
    setBids(bids.map(b => b.id === bid.id ? { ...b, status: 'archived', archivedAt: new Date().toISOString() } : b));
    Swal.fire({ icon: 'success', title: 'Archived', text: `${bid.customerName}'s bid moved to archive.`, timer: 2000, showConfirmButton: false });
  };

  const handleRestore = async (bid) => {
    await updateDoc(doc(db, "bids", bid.id), {
      status: 'pending',
      archivedAt: null,
      archivedBy: null,
      updatedAt: new Date().toISOString(),
    });
    setBids(bids.map(b => b.id === bid.id ? { ...b, status: 'pending', archivedAt: null } : b));
    Swal.fire({ icon: 'success', title: 'Restored', text: `${bid.customerName}'s bid is back in the active list.`, timer: 2000, showConfirmButton: false });
  };

  const handleEdit = (bid) => {
    navigate(`/bid/${bid.id}`);
  };

  const handleCreateContract = async (bid) => {
    try {
      const result = await createFullJobPackage(bid);
      if (!result) return;
      const { contractId, invoiceId, jobId } = result;
      Swal.fire({
        icon: "success",
        title: "Job Package Created!",
        html: `<b>${bid.customerName}</b>'s bid has been promoted.<br>
          <ul style="text-align:left">
            <li>Contract: ${contractId}</li>
            <li>Invoice: ${invoiceId}</li>
            <li>Job Folder: ${jobId}</li>
          </ul>`,
        confirmButtonText: "Open Contract",
      }).then(() => { window.location.assign(`/contract/${contractId}`); });
    } catch (error) {
      console.error("Error creating full job package:", error);
      Swal.fire({ icon: "error", title: "Error", text: "Could not create linked documents. Check console for details." });
    }
  };

  const handleGeneratePDF = async (bid) => {
    try {
      const pdf = await generateBidPDF(bid, logoDataUrl);
      const pdfBlob = pdf.output('blob');
      window.open(URL.createObjectURL(pdfBlob), '_blank');
      Swal.fire({ icon: "success", title: "PDF Opened!", text: `Viewing bid proposal for ${bid.customerName}`, timer: 2000, showConfirmButton: false });
    } catch (error) {
      Swal.fire({ icon: "error", title: "Error", text: "Failed to generate PDF. Please try again." });
    }
  };

  const activeBids = bids.filter(b => b.status !== 'archived');
  const archivedBids = bids.filter(b => b.status === 'archived');

  // Bids expiring within 7 days (not yet archived, not signed)
  const expiringSoon = activeBids.filter(b => {
    if (b.clientSignature && b.contractorSignature) return false;
    if (b.status === 'archived') return false;
    const days = daysSinceEdit(b);
    return days !== null && days >= 23 && days < 30;
  });

  return (
    <Container sx={{ mt: 3, px: { xs: 1, sm: 2 } }}>

      {/* Expiring Soon Banner */}
      {!showArchived && expiringSoon.length > 0 && (
        <Box sx={{ mb: 2, p: 2, bgcolor: '#fff8e1', border: '1px solid #ff9800', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" color="warning.dark" fontWeight="bold">
            ⚠️ {expiringSoon.length} bid{expiringSoon.length > 1 ? 's' : ''} will auto-archive within 7 days:
          </Typography>
          <Typography variant="body2" color="warning.dark">
            {expiringSoon.map(b => `${b.customerName} (${30 - daysSinceEdit(b)}d left)`).join(', ')}
          </Typography>
        </Box>
      )}

      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h6" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
            {showArchived ? `Archived Bids (${archivedBids.length})` : `Bids (${activeBids.length})`}
          </Typography>
          <Button
            variant={showArchived ? "contained" : "outlined"}
            color="warning"
            size="small"
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? '← Active Bids' : `🗄️ Archive (${archivedBids.length})`}
          </Button>
        </Box>

        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="sort-label">
            <SortIcon sx={{ fontSize: 18, mr: 0.5, verticalAlign: 'middle' }} />
            Sort By
          </InputLabel>
          <Select labelId="sort-label" value={sortOrder} label="Sort By" onChange={(e) => setSortOrder(e.target.value)}>
            <MenuItem value="newest">Newest First</MenuItem>
            <MenuItem value="oldest">Oldest First</MenuItem>
            <MenuItem value="name-asc">Name (A-Z)</MenuItem>
            <MenuItem value="name-desc">Name (Z-A)</MenuItem>
            <MenuItem value="amount-high">Highest Amount</MenuItem>
            <MenuItem value="amount-low">Lowest Amount</MenuItem>
          </Select>
        </FormControl>

        {!showArchived && (
          <>
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => exportBidsToExcel(sortedBids)} size="small">
              Export Excel
            </Button>
            <Button variant="outlined" startIcon={<DescriptionIcon />} onClick={() => exportAllBidsToWord(sortedBids)} size="small">
              Export All (Word Zip)
            </Button>
          </>
        )}
      </Box>

      {/* Archive info banner */}
      {showArchived && (
        <Box sx={{ mb: 2, p: 2, bgcolor: '#f3e5f5', border: '1px solid #9c27b0', borderRadius: 2 }}>
          <Typography variant="body2" color="purple">
            🗄️ Bids are automatically archived 30 days after their last edit if not accepted. You can restore any bid to the active list, or permanently delete it from here.
          </Typography>
        </Box>
      )}

      {/* MOBILE VIEW */}
      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
        {sortedBids.map((bid) => {
          const days = daysSinceEdit(bid);
          const daysLeft = days !== null ? 30 - days : null;
          const isExpiringSoon = !showArchived && daysLeft !== null && daysLeft <= 7 && daysLeft > 0;
          const isSigned = bid.clientSignature && bid.contractorSignature;
          return (
            <Box key={bid.id} sx={{
              mb: 2, p: 2, border: '1px solid', borderRadius: 2, backgroundColor: 'white',
              borderColor: isExpiringSoon ? '#ff9800' : '#ddd',
              bgcolor: isExpiringSoon ? '#fffde7' : 'white',
            }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 1 }}>
                <Typography variant="h6">{bid.customerName}</Typography>
                {isSigned && <Chip label="✅ Signed" color="success" size="small" />}
                {isExpiringSoon && <Chip label={`⚠️ ${daysLeft}d left`} color="warning" size="small" />}
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Amount: ${bid.amount}</Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>{bid.description}</Typography>
              {bid.createdAt && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Created: {new Date(bid.createdAt).toLocaleDateString()}
                  {bid.updatedAt && bid.updatedAt !== bid.createdAt && ` · Edited: ${new Date(bid.updatedAt).toLocaleDateString()}`}
                </Typography>
              )}
              {showArchived && bid.archivedAt && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Archived: {new Date(bid.archivedAt).toLocaleDateString()}
                  {bid.archivedBy === 'auto' ? ' (auto)' : ' (manual)'}
                </Typography>
              )}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {!showArchived && (<>
                  <Button variant="outlined" color="info" size="small" onClick={() => handleEdit(bid)} fullWidth>Edit</Button>
                  <Button variant="outlined" color="primary" size="small" onClick={() => handleGeneratePDF(bid)} fullWidth>View PDF</Button>
                  <Button variant="outlined" color="success" size="small" onClick={() => handleCreateContract(bid)} fullWidth>Create Contract</Button>
                  <Button variant="outlined" size="small" startIcon={<DescriptionIcon />} onClick={() => exportBidToWord(bid)} fullWidth>Word Doc</Button>
                  <Button variant="outlined" color="warning" size="small" onClick={() => handleArchive(bid)} fullWidth>Archive</Button>
                  <Button variant="outlined" color="error" size="small" onClick={() => handleDelete(bid)} fullWidth>Delete</Button>
                </>)}
                {showArchived && (<>
                  <Button variant="outlined" color="success" size="small" onClick={() => handleRestore(bid)} fullWidth>↩ Restore</Button>
                  <Button variant="outlined" color="error" size="small" onClick={() => handleDelete(bid)} fullWidth>Delete Permanently</Button>
                </>)}
              </Box>
            </Box>
          );
        })}
        {sortedBids.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h6" color="text.secondary">
              {showArchived ? 'No archived bids' : 'No Bids Yet'}
            </Typography>
            {!showArchived && (
              <Button variant="contained" onClick={() => navigate('/create-bid')} sx={{ mt: 2 }}>Create Bid</Button>
            )}
          </Box>
        )}
      </Box>

      {/* DESKTOP VIEW */}
      <Box sx={{ display: { xs: 'none', md: 'block' }, overflowX: 'auto' }}>
        <table style={{ width: "100%", borderCollapse: "collapse", background: "white" }}>
          <thead>
            <tr style={{ background: "#f2f2f2", textAlign: "left", borderBottom: "2px solid #ccc" }}>
              <th style={{ padding: 10 }}>Customer</th>
              <th style={{ padding: 10 }}>Amount</th>
              <th style={{ padding: 10 }}>Description</th>
              <th style={{ padding: 10 }}>Date</th>
              {showArchived && <th style={{ padding: 10 }}>Archived</th>}
              <th style={{ padding: 10 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedBids.map((bid) => {
              const days = daysSinceEdit(bid);
              const daysLeft = days !== null ? 30 - days : null;
              const isExpiringSoon = !showArchived && daysLeft !== null && daysLeft <= 7 && daysLeft > 0;
              const isSigned = bid.clientSignature && bid.contractorSignature;
              return (
                <tr key={bid.id} style={{ borderBottom: "1px solid #ddd", backgroundColor: isExpiringSoon ? '#fffde7' : 'white' }}>
                  <td style={{ padding: 10 }}>
                    <strong>{bid.customerName}</strong>
                    {isSigned && <Chip label="✅ Signed" color="success" size="small" sx={{ ml: 1 }} />}
                    {isExpiringSoon && <Chip label={`⚠️ ${daysLeft}d left`} color="warning" size="small" sx={{ ml: 1 }} />}
                  </td>
                  <td style={{ padding: 10 }}>${bid.amount}</td>
                  <td style={{ padding: 10 }}>{bid.description}</td>
                  <td style={{ padding: 10 }}>
                    {bid.createdAt ? new Date(bid.createdAt).toLocaleDateString() : '—'}
                    {bid.updatedAt && bid.updatedAt !== bid.createdAt && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        Edited: {new Date(bid.updatedAt).toLocaleDateString()}
                      </Typography>
                    )}
                  </td>
                  {showArchived && (
                    <td style={{ padding: 10 }}>
                      {bid.archivedAt ? new Date(bid.archivedAt).toLocaleDateString() : '—'}
                      <Typography variant="caption" color="text.secondary" display="block">
                        {bid.archivedBy === 'auto' ? 'Auto-archived' : 'Manual'}
                      </Typography>
                    </td>
                  )}
                  <td style={{ padding: 10 }}>
                    {!showArchived && (<>
                      <Button variant="outlined" color="info" size="small" onClick={() => handleEdit(bid)} sx={{ mr: 1, mb: 1 }}>Edit</Button>
                      <Button variant="outlined" color="primary" size="small" onClick={() => handleGeneratePDF(bid)} sx={{ mr: 1, mb: 1 }}>PDF</Button>
                      <Button variant="outlined" color="success" size="small" onClick={() => handleCreateContract(bid)} sx={{ mr: 1, mb: 1 }}>Contract</Button>
                      <Button variant="outlined" size="small" startIcon={<DescriptionIcon />} onClick={() => exportBidToWord(bid)} sx={{ mr: 1, mb: 1 }}>Word</Button>
                      <Button variant="outlined" color="warning" size="small" onClick={() => handleArchive(bid)} sx={{ mr: 1, mb: 1 }}>Archive</Button>
                      <Button variant="outlined" color="error" size="small" onClick={() => handleDelete(bid)}>Delete</Button>
                    </>)}
                    {showArchived && (<>
                      <Button variant="outlined" color="success" size="small" onClick={() => handleRestore(bid)} sx={{ mr: 1 }}>↩ Restore</Button>
                      <Button variant="outlined" color="error" size="small" onClick={() => handleDelete(bid)}>Delete Permanently</Button>
                    </>)}
                  </td>
                </tr>
              );
            })}
            {sortedBids.length === 0 && (
              <tr>
                <td colSpan={showArchived ? 6 : 5} style={{ padding: 40, textAlign: 'center' }}>
                  <Typography variant="h6" color="text.secondary">
                    {showArchived ? 'No archived bids' : 'No Bids Yet'}
                  </Typography>
                  {!showArchived && (
                    <Button variant="contained" onClick={() => navigate('/create-bid')} sx={{ mt: 2 }}>Create Bid</Button>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Box>
    </Container>
  );
}

// ------------------------- HOME REDIRECT COMPONENT -------------------------
function HomeRedirect() {
  const { userRole } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (userRole === 'crew') {
      navigate('/time-clock', { replace: true });
    }
  }, [userRole, navigate]);

  if (userRole === 'crew') {
    return null;
  }

  return <EnhancedDashboard />;
}

// ------------------------- APP CHROME -------------------------
function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Get auth context

  // Get auth context
  const { userRole, logout, user } = useAuth();
  
  // NEW: User data state for first-login detection
  const [userData, setUserData] = useState(null);

  // Load notification counts
  const { counts, loading: countsLoading } = useNotificationCounts();
 
  useEffect(() => {
    window.dispatchEvent(new Event('refreshBadges'));
  }, [location.pathname]);

  // Auto-refresh when user comes back to the app (iPhone/Android/desktop)
  useEffect(() => {
    let lastVersion = null;

    const checkForUpdate = async () => {
      try {
        const res = await fetch('/version.txt?t=' + Date.now());
        if (res.ok) {
          const version = await res.text();
          if (lastVersion && version !== lastVersion) {
            window.location.reload();
          }
          lastVersion = version;
        }
      } catch (e) {
        // Network error, ignore
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    checkForUpdate(); // Check on first load

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // NEW: Listen to user data changes for first-login detection
  useEffect(() => {
    if (!user) {
      setUserData(null);
      return;
    }

    // Subscribe to user document changes
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      (docSnap) => {
        if (docSnap.exists()) {
          setUserData(docSnap.data());
        }
      },
      (error) => {
        console.error('Error listening to user data:', error);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // NEW: First-login NDA redirect logic
  useEffect(() => {
    if (!user || !userData) return;
    
    const currentPath = location.pathname;
    
    // Don't redirect if already on NDA page or public pages
    if (currentPath === '/nda-signing' || currentPath.startsWith('/public/')) {
      return;
    }

    // Check if employee needs to sign NDA
    if (userData.firstLogin === true && userData.ndaSigned === false) {
      console.log('First login detected, redirecting to NDA signing...');
      navigate('/nda-signing');
    }
  }, [user, userData, location.pathname, navigate]);
  const isActive = (p) => location.pathname === p;
  
  const isPublicPage = location.pathname.startsWith('/public/');

  // ROLE-SPECIFIC MENU ITEMS
  let menuItems = [];

  if (userRole === 'crew') {
    // CREW sees only time clock and their hours
    menuItems = [
      { label: "Time Clock", path: "/time-clock", notificationKey: null },
      { label: "My Profile", path: "/profile", notificationKey: null },
      { label: "My Hours", path: "/my-hours", notificationKey: null },
    ];
  } else {
    // ADMIN and GOD see full menu
    menuItems = [
      { label: "Dashboard", path: "/", notificationKey: null },
      { label: "Bids", path: "/bids", notificationKey: "bids" },
      { label: "Create Bid", path: "/create-bid", notificationKey: null },
      { label: "Contracts", path: "/contracts", notificationKey: "contracts" },
      { label: "Invoices", path: "/invoices", notificationKey: "invoices" },
      { label: "Jobs", path: "/jobs", notificationKey: "jobs" },
      { label: "Notes", path: "/notes", notificationKey: "notes" },
      { label: "Customers", path: "/customers", notificationKey: "customers" },
      { label: "Schedule", path: "/schedule-dashboard", notificationKey: "schedules" },
      { label: "Calendar", path: "/calendar-view", notificationKey: null },
      // 🔒 CRITICAL: Maintenance menu item - DO NOT REMOVE
      { label: "Maintenance", path: "/maintenance", notificationKey: null },
      { label: "Payments", path: "/payments-dashboard", notificationKey: "payments" },
      { label: "Expenses", path: "/expenses-manager", notificationKey: "expenses" },
      { label: "Payroll", path: "/crew-payroll", notificationKey: null },
      { label: "Approve Time", path: "/approve-time", notificationKey: null },
      { label: "Tax Report", path: "/tax-report", notificationKey: null },
      { label: "Equipment", path: "/equipment-manager", notificationKey: null },
	  { label: "Employees", path: "/employees", notificationKey: null },
      { label: "SMS Notifications", path: "/notification-settings", notificationKey: null },
      { label: "My Profile", path: "/profile", notificationKey: null },
    ];
  }

  const handleDrawerToggle = () => {
    setDrawerOpen(!drawerOpen);
  };

  const handleMenuClick = (path) => {
    navigate(path);
    setDrawerOpen(false);
  };

  const handleLogout = async () => {
    const confirmed = window.confirm('Are you sure you want to logout?');
    if (confirmed) {
      await logout();
    }
  };

  // Role badge emoji
  const getRoleBadge = () => {
    if (userRole === 'god') return '⚡';
    if (userRole === 'admin') return '🔧';
    if (userRole === 'crew') return '👷';
    return '';
  };

  return (
    <>
      {/* Auto-update notification */}
      <UpdateNotification />
      
      {!isPublicPage && (
        <>
          <AppBar position="static" sx={{ backgroundColor: "#1565c0" }}>
            <Toolbar sx={{ minHeight: { xs: 56, sm: 64 } }}>
              <Typography variant="h6" sx={{ flexGrow: 1, fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
                KCL Manager {getRoleBadge()}
              </Typography>

              {isMobile ? (
                <>
                  <RefreshButton isMobile={true} />
                  <IconButton
                    color="inherit"
                    onClick={handleLogout}
                    title={`Logout (${user?.email})`}
                    sx={{ mr: 1 }}
                  >
                    <LogoutIcon />
                  </IconButton>
                  <IconButton
                    color="inherit"
                    edge="end"
                    onClick={handleDrawerToggle}
                  >
                    <MenuIcon />
                  </IconButton>
                </>
              ) : (
                <>
                  <ButtonGroup variant="text" sx={{ mr: 2 }}>
                    {menuItems.map((item) => {
                      const count = item.notificationKey ? counts[item.notificationKey] : 0;
                      const showBadge = count > 0 && !countsLoading;

                      return (
                        <Button
                          key={item.path}
                          component={Link}
                          to={item.path}
                          sx={{
                            color: isActive(item.path) ? "#fff" : "rgba(255,255,255,0.7)",
                            backgroundColor: isActive(item.path)
                              ? "rgba(255,255,255,0.1)"
                              : "transparent",
                            fontWeight: isActive(item.path) ? 700 : 500,
                            fontSize: { sm: '0.75rem', md: '0.875rem' },
                            px: { sm: 1, md: 1.5 },
                            "&:hover": {
                              backgroundColor: "rgba(255,255,255,0.15)",
                              color: "#fff",
                            },
                          }}
                        >
                          <Badge 
                            badgeContent={showBadge ? count : 0} 
                            color="error"
                            sx={{
                              '& .MuiBadge-badge': {
                                fontSize: '0.7rem',
                                minWidth: '18px',
                                height: '18px',
                                padding: '0 4px',
                              }
                            }}
                          >
                            {item.label}
                          </Badge>
                        </Button>
                      );
                    })}
                  </ButtonGroup>

                  <RefreshButton isMobile={false} />
                  <Button
                    color="inherit"
                    onClick={handleLogout}
                    startIcon={<LogoutIcon />}
                    title={user?.email || 'Logout'}
                  >
                    Logout
                  </Button>
                </>
              )}
            </Toolbar>
          </AppBar>

          <Drawer
            anchor="right"
            open={drawerOpen}
            onClose={handleDrawerToggle}
            sx={{
              '& .MuiDrawer-paper': {
                width: 280,
              },
            }}
          >
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e0e0e0' }}>
              <Typography variant="h6">Menu</Typography>
              <IconButton onClick={handleDrawerToggle}>
                <CloseIcon />
              </IconButton>
            </Box>
            <List>
              {menuItems.map((item) => {
                const count = item.notificationKey ? counts[item.notificationKey] : 0;
                const showBadge = count > 0 && !countsLoading;

                return (
                  <ListItem
                    button
                    key={item.path}
                    onClick={() => handleMenuClick(item.path)}
                    sx={{
                      backgroundColor: isActive(item.path) ? "#e3f2fd" : "transparent",
                    }}
                  >
                    <Badge 
                      badgeContent={showBadge ? count : 0} 
                      color="error"
                      sx={{ width: '100%' }}
                    >
                      <ListItemText
                        primary={item.label}
                        primaryTypographyProps={{
                          fontWeight: isActive(item.path) ? 700 : 500,
                        }}
                      />
                    </Badge>
                  </ListItem>
                );
              })}
            </List>
          </Drawer>
        </>
      )}

      <Routes>
        {/* CREW ROUTES */}
        <Route path="/time-clock" element={<TimeClock />} />
        <Route path="/my-hours" element={<MyHours />} />
        <Route path="/profile" element={<UserProfile />} />
        
        {/* ADMIN/GOD ROUTES */}
        <Route path="/approve-time" element={<ApproveTime />} />
        
        {/* HOME ROUTE - REDIRECTS CREW TO TIME CLOCK */}
        <Route path="/" element={<HomeRedirect />} />
        
        {/* EXISTING ROUTES */}
        <Route path="/bids" element={<BidsList />} />
        <Route path="/bid/:id" element={<BidEditor />} />
        <Route path="/create-bid" element={<CreateBid />} />
        <Route path="/contracts" element={<ContractsDashboard />} />
        <Route path="/contract/:id" element={<ContractEditor />} />
        <Route path="/invoices" element={<InvoicesDashboard />} />
        <Route path="/invoice/:id" element={<InvoiceEditor />} />
		{/* OLD migration page - disabled */}
        {/* <Route path="/migration" element={<MigrationPage />} /> */}

        {/* NEW migration dashboard */}
        <Route path="/migration" element={<MigrationDashboard />} />
        <Route path="/jobs" element={<JobsManager />} />
        <Route path="/notes" element={<NotesManager />} /> {/* â† ADDED: Notes route */}
        <Route path="/customers" element={<CustomersDashboard />} />
        <Route path="/customer-edit/:id" element={<CustomerEditor />} />
		<Route path="/expense-repair" element={<ExpenseRepairTool />} />
        <Route path="/customer/:id" element={<CustomerProfile />} />
        <Route path="/schedule-job" element={<ScheduleJob />} />
        <Route path="/migrate-tokens" element={<MigrationPage />} />
        <Route path="/schedule-dashboard" element={<ScheduleDashboard />} />
		<Route path="/jim-slayer-fix" element={<JimSlayerExpenseFix />} />
        <Route path="/calendar-view" element={<CalendarView />} />
        {/* 🔒 CRITICAL: Maintenance routes - DO NOT REMOVE */}
        <Route path="/maintenance" element={<MaintenanceDashboard />} />
        <Route path="/maintenance/:id" element={<MaintenanceEditor />} />
        <Route path="/notification-settings" element={<NotificationSettings />} /> {/* NEW: SMS Settings */}
        {/* ========================================= */}
        <Route path="/payment-tracker/:id" element={<PaymentTracker />} />
        <Route path="/payments-dashboard" element={<PaymentsDashboard />} />
        <Route path="/crew-manager" element={<CrewManager />} />
        <Route path="/equipment-manager" element={<EquipmentManager />} />
		<Route path="/employees" element={<EmployeeAccountManager currentUser={user} currentUserRole={userRole} />} />
        <Route path="/nda/:crewId" element={<NDAEditor />} />
        <Route path="/public/nda/:crewId" element={<NDASigningPage />} />
        
        {/* NEW: Employee First-Login NDA Signing */}
        <Route 
          path="/nda-signing" 
          element={
            <NDASigning 
              currentUser={user} 
              onNDAComplete={() => {
                // Refresh user data after NDA signing
                if (user) {
                  getDoc(doc(db, 'users', user.uid)).then((docSnap) => {
                    if (docSnap.exists()) {
                      setUserData(docSnap.data());
                    }
                  });
                }
                navigate('/');
              }}
            />
          } 
        />
        <Route path="/expenses-manager" element={<ExpensesManager />} />
        <Route path="/crew-payroll" element={<IntegratedPayroll />} /> {/* ✅ CHANGED: New integrated system */}
        <Route path="/crew-payment-history" element={<CrewPaymentHistory />} />
        <Route path="/tax-report" element={<TaxReport />} />
        <Route path="/job-expenses/:id" element={<JobExpenses />} />
        
        <Route path="/public/sign/:contractId" element={<ContractSigningPage />} />
		<Route path="/sign-bid/:bidId" element={<BidSigningPage />} />
        <Route path="/public/pay/:invoiceId" element={<PaymentPortal />} />
      </Routes>
    </>
  );
}

// ------------------------- ROUTER WRAPPER -------------------------
export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
      
      {/* Version display in bottom-right corner */}
      <VersionDisplay />
    </AuthProvider>
  );
}