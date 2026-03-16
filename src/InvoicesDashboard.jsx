import React, { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  getDoc,
  addDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db, storage } from "./firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { generateSecureToken } from './utils/tokenUtils';
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  Button,
  Chip,
  MenuItem,
  Select,
  Box,
  Card,
  CardContent,
  CardActions,
  FormControl,
  InputLabel,
  useMediaQuery,
  useTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Checkbox,
  FormControlLabel,
  Alert,
  LinearProgress,
} from "@mui/material";
import { useNavigate, useLocation } from "react-router-dom";
import Swal from "sweetalert2";
import EditIcon from "@mui/icons-material/Edit";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import DeleteIcon from "@mui/icons-material/Delete";
import PaymentIcon from "@mui/icons-material/Payment";
import SortIcon from "@mui/icons-material/Sort";
import GrassIcon from "@mui/icons-material/Grass";
import SpeedIcon from "@mui/icons-material/Speed";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";
import moment from "moment";
import generateInvoicePDF from "./pdf/generateInvoicePDF";
import { markAsViewed } from './useNotificationCounts';
import { useAuth } from './AuthProvider';

export default function InvoicesDashboard() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [sortedInvoices, setSortedInvoices] = useState([]);
  const [sortOrder, setSortOrder] = useState("newest");
  const [selectedYear, setSelectedYear] = useState("all");
  const [filters, setFilters] = useState({
    startDate: "2020-01-01",
    endDate: "2030-12-31",
  });

  // Handle year selection
  const handleYearChange = (year) => {
    setSelectedYear(year);
    if (year === "all") {
      setFilters({
        startDate: "2020-01-01",
        endDate: "2030-12-31",
      });
    } else {
      setFilters({
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`,
      });
    }
  };
  const navigate = useNavigate();
  const location = useLocation(); // ADD THIS LINE
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  
  // Quick Weed Invoice state
  const [weedDialogOpen, setWeedDialogOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [weedInvoice, setWeedInvoice] = useState({
    customerId: "",
    customerName: "",
    serviceDate: moment().format("YYYY-MM-DD"),
    startTime: "08:00",
    endTime: "17:00",
    frontYard: false,
    backYard: false,
    other: false,
    beforePhoto: null,
    afterPhoto: null,
    beforePhotoURL: "",
    afterPhotoURL: "",
    paymentMethod: "", // Cash, Zelle, Check, or empty for not collected
  });
  
  // Quick Add Customer state
  const [addCustomerDialogOpen, setAddCustomerDialogOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
  });

  const fetchInvoices = async () => {
    try {
      const snap = await getDocs(collection(db, "invoices"));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      
      // Load all payments and attach totals to each invoice
      const paymentsSnap = await getDocs(collection(db, "payments"));
      const allPayments = paymentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      
      const invoicesWithPayments = data.map((inv) => {
        const invoicePayments = allPayments.filter((p) => p.invoiceId === inv.id);
        const totalPaid = invoicePayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
        const invoiceTotal = parseFloat(inv.total || inv.amount || 0);
        const remainingBalance = invoiceTotal - totalPaid;
        const paymentCount = invoicePayments.length;
        
        return {
          ...inv,
          _totalPaid: totalPaid,
          _remainingBalance: remainingBalance,
          _paymentCount: paymentCount,
          _percentPaid: invoiceTotal > 0 ? Math.min((totalPaid / invoiceTotal) * 100, 100) : 0,
        };
      });
      
      setInvoices(invoicesWithPayments);
    } catch (err) {
      console.error("Error loading invoices:", err);
    }
  };
  
  const fetchCustomers = async () => {
    try {
      const snap = await getDocs(collection(db, "customers"));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Sort by name for dropdown
      data.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setCustomers(data);
    } catch (err) {
      console.error("Error loading customers:", err);
    }
  };
  
  useEffect(() => {
    fetchInvoices();
    fetchCustomers(); // Load customers for quick weed invoice
  }, [location.pathname, location.key]); // This will definitely trigger
  
  useEffect(() => {
    markAsViewed('invoices');
  }, []);
  
  // Auto-open weed dialog if quickWeed=true query parameter is present
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('quickWeed') === 'true') {
      setWeedDialogOpen(true);
      // Clean up the query parameter to prevent dialog from reopening on refresh/back
      navigate('/invoices', { replace: true });
    }
  }, [location.search, navigate]);

  // Helper function to convert Firebase Timestamp to JavaScript Date
  const getDateFromInvoice = (invoice) => {
    try {
      // Check invoiceDate FIRST (the actual invoice date field)
      if (invoice.invoiceDate) {
        if (invoice.invoiceDate.toDate) {
          return invoice.invoiceDate.toDate();
        }
        return new Date(invoice.invoiceDate);
      }
      // Fallback to date field (legacy)
      if (invoice.date) {
        if (invoice.date.toDate) {
          return invoice.date.toDate();
        }
        return new Date(invoice.date);
      }
      // Last fallback to createdAt
      if (invoice.createdAt) {
        if (invoice.createdAt.toDate) {
          return invoice.createdAt.toDate(); // Firebase Timestamp
        }
        return new Date(invoice.createdAt); // String date
      }
      return null;
    } catch (error) {
      console.error("Error parsing date:", error);
      return null;
    }
  };

  // Helper function to format date for display
  const formatInvoiceDate = (invoice) => {
    const date = getDateFromInvoice(invoice);
    if (!date || isNaN(date.getTime())) {
      return "â€”";
    }
    return date.toLocaleDateString();
  };

  // Sort invoices whenever invoices or sortOrder changes
  useEffect(() => {
    const sorted = [...invoices].sort((a, b) => {
      switch (sortOrder) {
        case "newest":
          const dateA = getDateFromInvoice(a);
          const dateB = getDateFromInvoice(b);
          return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
        case "oldest":
          const dateA2 = getDateFromInvoice(a);
          const dateB2 = getDateFromInvoice(b);
          return (dateA2?.getTime() || 0) - (dateB2?.getTime() || 0);
        case "name-asc":
          return (a.clientName || "").localeCompare(b.clientName || "");
        case "name-desc":
          return (b.clientName || "").localeCompare(a.clientName || "");
        case "description-asc":
          return (a.description || "").localeCompare(b.description || "");
        case "description-desc":
          return (b.description || "").localeCompare(a.description || "");
        case "amount-high":
          return parseFloat(b.total || b.amount || 0) - parseFloat(a.total || a.amount || 0);
        case "amount-low":
          return parseFloat(a.total || a.amount || 0) - parseFloat(b.total || b.amount || 0);
        case "status-unpaid":
          const aUnpaid = (a.status || "").toLowerCase() !== "paid" ? -1 : 1;
          const bUnpaid = (b.status || "").toLowerCase() !== "paid" ? -1 : 1;
          return aUnpaid - bUnpaid;
        case "status-paid":
          const aPaid = (a.status || "").toLowerCase() === "paid" ? -1 : 1;
          const bPaid = (b.status || "").toLowerCase() === "paid" ? -1 : 1;
          return aPaid - bPaid;
        default:
          return 0;
      }
    });
    setSortedInvoices(sorted);
  }, [invoices, sortOrder]);

    const handleStatusChange = async (id, newStatus) => {
    try {
      const ref = doc(db, "invoices", id);
      const invoiceSnap = await getDoc(ref);
      const invoiceData = invoiceSnap.data();
      const oldStatus = invoiceData.status;
      
      // ✅ AUTO-HANDLE: When changing to "Paid"
      if (newStatus === "Paid" && oldStatus !== "Paid") {
        const total = parseFloat(invoiceData.total || invoiceData.amount || 0);
        
        // Check if payment record exists
        const paymentsQuery = query(
          collection(db, "payments"),
          where("invoiceId", "==", id)
        );
        const paymentsSnap = await getDocs(paymentsQuery);
        
        if (paymentsSnap.empty) {
          // Lookup customerId if not present on invoice
          let customerId = invoiceData.customerId || null;
          if (!customerId && invoiceData.clientName) {
            try {
              const customersQuery = query(
                collection(db, 'customers'),
                where('name', '==', invoiceData.clientName)
              );
              const customersSnap = await getDocs(customersQuery);
              if (!customersSnap.empty) {
                customerId = customersSnap.docs[0].id;
              }
            } catch (err) {
              console.warn('Failed to lookup customer by name:', err);
            }
          }

          // Auto-create payment record
          await addDoc(collection(db, "payments"), {
            invoiceId: id,
            clientName: invoiceData.clientName,
            customerId: customerId,
            amount: total,
            paymentMethod: "other",
            paymentDate: new Date().toISOString().split("T")[0],
            reference: "Auto-generated from status change",
            notes: "Created when invoice marked as Paid from dashboard",
            receiptGenerated: false,
            createdAt: new Date().toISOString(),
          });
        }

        // ✅ Auto-complete the related job if it exists
        if (invoiceData.jobId) {
          try {
            const jobRef = doc(db, "jobs", invoiceData.jobId);
            const jobSnap = await getDoc(jobRef);
            
            if (jobSnap.exists()) {
              await updateDoc(jobRef, {
                status: "Completed",
                completedDate: new Date().toISOString(),
              });
            }
          } catch (jobError) {
            console.warn("Could not auto-complete job:", jobError);
          }
        }

        // ✅ Phase 2C Fix 5: Update customer lifetime value
        if (invoiceData.customerId) {
          try {
            const customerRef = doc(db, "customers", invoiceData.customerId);
            const customerSnap = await getDoc(customerRef);
            if (customerSnap.exists()) {
              const currentValue = parseFloat(customerSnap.data().lifetimeValue || 0);
              await updateDoc(customerRef, {
                lifetimeValue: currentValue + total,
              });
              console.log("✅ Updated customer lifetime value:", currentValue + total);
            }
          } catch (custError) {
            console.warn("Could not update customer lifetime value:", custError);
          }
        }
        
        // Update invoice with payment tracking fields
        await updateDoc(ref, { 
          status: newStatus,
          totalPaid: total,
          remainingBalance: 0,
          paymentStatus: "paid",
        });
      } else {
        // Normal status update
        await updateDoc(ref, { status: newStatus });
      }
      
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === id ? { ...inv, status: newStatus } : inv
        )
      );
    } catch (err) {
      console.error("Error updating invoice status:", err);
    }
  };

  // ===================== QUICK WEED INVOICE HANDLERS =====================
  
  const calculateWeedTotal = () => {
    let total = 0;
    if (weedInvoice.frontYard) total += 50;
    if (weedInvoice.backYard) total += 50;
    if (weedInvoice.other) total += 75;
    return total;
  };

  const handleWeedInvoiceChange = (field, value) => {
    setWeedInvoice(prev => ({ ...prev, [field]: value }));
  };

  const handleCustomerSelect = (customerId) => {
    const customer = customers.find(c => c.id === customerId);
    setWeedInvoice(prev => ({
      ...prev,
      customerId,
      customerName: customer ? customer.name : "",
    }));
  };

  const handleCreateWeedInvoice = async () => {
    // Validation
    if (!weedInvoice.customerId) {
      Swal.fire("Error", "Please select a customer", "error");
      return;
    }

    const total = calculateWeedTotal();
    if (total === 0) {
      Swal.fire("Error", "Please select at least one service", "error");
      return;
    }

    try {
      // Show loading state if photos are being uploaded
      if (weedInvoice.beforePhoto || weedInvoice.afterPhoto) {
        Swal.fire({
          title: "Creating Invoice...",
          html: "Uploading photos, please wait...",
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });
      }

      // Upload photos to Firebase Storage
      let beforePhotoURL = "";
      let afterPhotoURL = "";

      if (weedInvoice.beforePhoto) {
        beforePhotoURL = await uploadPhotoToStorage(
          weedInvoice.beforePhoto,
          weedInvoice.customerId,
          "before"
        );
      }

      if (weedInvoice.afterPhoto) {
        afterPhotoURL = await uploadPhotoToStorage(
          weedInvoice.afterPhoto,
          weedInvoice.customerId,
          "after"
        );
      }

      // Build description
      const services = [];
      if (weedInvoice.frontYard) services.push("Front Yard Weed Spraying");
      if (weedInvoice.backYard) services.push("Back Yard Weed Spraying");
      if (weedInvoice.other) services.push("Other Weed Extraction");
      
      const description = `Weed Control Services:\n${services.join("\n")}`;

      // Get customer data
      const customer = customers.find(c => c.id === weedInvoice.customerId);

      // Determine invoice status based on payment collection
      const invoiceStatus = weedInvoice.paymentMethod ? "Paid" : "Sent";

      // Create invoice with photos
      const invoiceData = {
        clientName: customer.name,
        clientEmail: customer.email || "",
        clientPhone: customer.phone || "",
        clientAddress: customer.address || "",
        description,
        subtotal: total,
        tax: 0,
        total,
        status: invoiceStatus,
        invoiceDate: weedInvoice.serviceDate,
        createdAt: serverTimestamp(),
        type: "Quick Weed Invoice",
        materials: services.map((service, idx) => {
          let cost = 0;
          if (service.includes("Front Yard")) cost = 50;
          else if (service.includes("Back Yard")) cost = 50;
          else if (service.includes("Other")) cost = 75;
          
          return `${service} - $${cost}`;
        }).join("\n"),
        beforePhoto: beforePhotoURL,
        afterPhoto: afterPhotoURL,
        hasPhotos: !!(beforePhotoURL || afterPhotoURL),
        paymentToken: generateSecureToken(),
      };

      const invoiceRef = await addDoc(collection(db, "invoices"), invoiceData);

      // If payment was collected, create payment record
      if (weedInvoice.paymentMethod) {
        await addDoc(collection(db, "payments"), {
          invoiceId: invoiceRef.id,
          clientName: customer.name,
          amount: total,
          paymentMethod: weedInvoice.paymentMethod,
          paymentDate: weedInvoice.serviceDate,
          reference: "Payment collected on-site",
          notes: `Quick Weed Invoice - ${services.join(", ")}`,
          receiptGenerated: false,
          createdAt: new Date().toISOString(),
        });
      }

            // Create calendar entry to show work was done
      // Auto-assign currently logged-in user to the crew
      console.log("🔵 DEBUG: user =", user);
      const selectedCrews = [];      
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            selectedCrews.push({
              id: user.uid,
              name: userData.name || user.email,
            });
          }
        } catch (error) {
          console.error("Error fetching user data for crew assignment:", error);
        }
      }

      await addDoc(collection(db, "schedules"), {
        clientName: customer.name,
		customerId: customer.id,  // ← ADD THIS LINE
        jobDescription: description,
        startDate: weedInvoice.serviceDate,
        endDate: weedInvoice.serviceDate,
        startTime: weedInvoice.startTime,
        endTime: weedInvoice.endTime,
        priority: "normal",
        status: "completed",
        assignedEmployees: selectedCrews.map(c => c.id),
        selectedEquipment: [],
        notes: "Quick weed spraying job - auto-created from invoice",
        createdAt: serverTimestamp(),
      });
      
            // ✅ FIXED: Create Job record with better notes and jobType
      const jobNotes = description 
        ? `Quick weed spraying job - auto-created from invoice\n\nServices Provided:\n${description}`
        : "Quick weed spraying job - auto-created from invoice";

      await addDoc(collection(db, "jobs"), {
        customerId: customer.id,
        clientName: customer.name,
        jobDescription: description,
        description: description,
        status: "Completed",
        priority: "normal",
        serviceDate: weedInvoice.serviceDate,
        startDate: weedInvoice.serviceDate,
        completionDate: weedInvoice.serviceDate,
        startTime: weedInvoice.startTime,
        endTime: weedInvoice.endTime,
        assignedEmployees: selectedCrews.map(c => c.id),
        notes: jobNotes, // ✅ FIXED: Better notes with service details
        amount: total,
        jobType: "Quick Weed Service", // ✅ NEW: Tag for filtering
		invoiceSource: "quick-weed-invoice",
        beforePhotos: beforePhotoURL ? [beforePhotoURL] : [],
        afterPhotos: afterPhotoURL ? [afterPhotoURL] : [],
        createdAt: serverTimestamp(),
        completedAt: serverTimestamp(),
      });
      

      // Success!
      const photoMessage = beforePhotoURL && afterPhotoURL 
        ? "<p>✅ Before & After photos uploaded</p>"
        : beforePhotoURL 
        ? "<p>✅ Before photo uploaded</p>"
        : afterPhotoURL
        ? "<p>✅ After photo uploaded</p>"
        : "";

      const paymentMessage = weedInvoice.paymentMethod 
        ? `<p>✅ Payment collected (${weedInvoice.paymentMethod.toUpperCase()})</p><p>✅ Payment record created</p>`
        : "<p>⏳ Invoice sent (awaiting payment)</p>";

      Swal.fire({
        title: "Invoice Created!",
        html: `
          <p><strong>${customer.name}</strong></p>
          <p><strong>Total: $${total}</strong></p>
          <p>✅ Invoice created</p>
          <p>✅ Added to calendar</p>
          ${photoMessage}
          ${paymentMessage}
        `,
        icon: "success",
      });

      // Clean up photo URLs
      if (weedInvoice.beforePhotoURL) URL.revokeObjectURL(weedInvoice.beforePhotoURL);
      if (weedInvoice.afterPhotoURL) URL.revokeObjectURL(weedInvoice.afterPhotoURL);

      // Reset form and close dialog
      setWeedDialogOpen(false);
      setWeedInvoice({
        customerId: "",
        customerName: "",
        serviceDate: moment().format("YYYY-MM-DD"),
        startTime: "08:00",
        endTime: "17:00",
        frontYard: false,
        backYard: false,
        other: false,
        beforePhoto: null,
        afterPhoto: null,
        beforePhotoURL: "",
        afterPhotoURL: "",
        paymentMethod: "",
      });

      // Refresh invoices
      fetchInvoices();
    } catch (error) {
      console.error("Error creating weed invoice:", error);
      Swal.fire("Error", "Failed to create invoice: " + error.message, "error");
    }
  };

  // Quick Add Customer handler
  const handleQuickAddCustomer = async () => {
    if (!newCustomer.name || newCustomer.name.trim() === "") {
      Swal.fire("Error", "Customer name is required", "error");
      return;
    }

    try {
      const customerData = {
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim(),
        email: newCustomer.email.trim(),
        address: newCustomer.address.trim(),
        createdAt: serverTimestamp(),
        lifetimeValue: 0,
        contractCount: 0,
        bidCount: 0,
        notes: "Quick-added from weed invoice",
      };

      const customerRef = await addDoc(collection(db, "customers"), customerData);
      
      // Reload customers and auto-select the new one
      await fetchCustomers();
      
      // Auto-select the newly created customer
      setWeedInvoice(prev => ({
        ...prev,
        customerId: customerRef.id,
        customerName: newCustomer.name.trim(),
      }));

      // Reset and close
      setNewCustomer({ name: "", phone: "", email: "", address: "" });
      setAddCustomerDialogOpen(false);

      Swal.fire({
        title: "Customer Added!",
        text: `${newCustomer.name} has been added and selected`,
        icon: "success",
        timer: 2000,
      });
    } catch (error) {
      console.error("Error adding customer:", error);
      Swal.fire("Error", "Failed to add customer: " + error.message, "error");
    }
  };

  // ===================== PHOTO HANDLERS FOR QUICK WEED INVOICE =====================
  
  const handlePhotoSelect = async (photoType, event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      Swal.fire("Error", "Please select an image file", "error");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      Swal.fire("Error", "Image must be smaller than 5MB", "error");
      return;
    }

    // Create preview URL and store file
    const previewURL = URL.createObjectURL(file);
    
    if (photoType === 'before') {
      setWeedInvoice(prev => ({
        ...prev,
        beforePhoto: file,
        beforePhotoURL: previewURL,
      }));
    } else {
      setWeedInvoice(prev => ({
        ...prev,
        afterPhoto: file,
        afterPhotoURL: previewURL,
      }));
    }
  };

  const handleRemovePhoto = (photoType) => {
    if (photoType === 'before') {
      if (weedInvoice.beforePhotoURL) {
        URL.revokeObjectURL(weedInvoice.beforePhotoURL);
      }
      setWeedInvoice(prev => ({
        ...prev,
        beforePhoto: null,
        beforePhotoURL: "",
      }));
    } else {
      if (weedInvoice.afterPhotoURL) {
        URL.revokeObjectURL(weedInvoice.afterPhotoURL);
      }
      setWeedInvoice(prev => ({
        ...prev,
        afterPhoto: null,
        afterPhotoURL: "",
      }));
    }
  };

  const uploadPhotoToStorage = async (file, customerId, photoType) => {
    if (!file) return null;

    const timestamp = Date.now();
    const filename = `weed-invoices/${customerId}/${photoType}-${timestamp}.jpg`;
    const storageRef = ref(storage, filename);

    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);
    return downloadURL;
  };

  // ===================================================================

  const handleDelete = async (id, client) => {
    const confirm = await Swal.fire({
      title: `Delete ${client}'s invoice?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes",
      cancelButtonText: "No",
    });
    if (!confirm.isConfirmed) return;
    await deleteDoc(doc(db, "invoices", id));
    setInvoices(invoices.filter((x) => x.id !== id));
  };

  const handlePDF = async (inv) => {
    try {
      // Load logo
      let logoDataUrl = null;
      try {
        const blob = await fetch("/logo-kcl.png").then((r) => (r.ok ? r.blob() : null));
        if (blob) {
          logoDataUrl = await new Promise((res) => {
            const fr = new FileReader();
            fr.onload = () => res(fr.result);
            fr.readAsDataURL(blob);
          });
        }
      } catch (e) {
        console.warn("Logo failed:", e);
      }

      // Load expenses for this job
      let expenses = [];
      if (inv.jobId) {
        try {
          const expensesSnap = await getDocs(collection(db, "expenses"));
          expenses = expensesSnap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((e) => e.jobId === inv.jobId);
          console.log(`ðŸ“Š Loaded ${expenses.length} expenses for invoice PDF`);
        } catch (e) {
          console.warn("Failed to load expenses:", e);
        }
      }

      // Generate PDF with expenses and material breakdown flag
      const pdfDoc = await generateInvoicePDF(
        {
          ...inv,
          logoDataUrl,
        },
        expenses,
        inv.includeMaterialBreakdown || false
      );

      // Mobile-friendly PDF viewing
      const pdfBlob = pdfDoc.output("blob");
      const pdfUrl = URL.createObjectURL(pdfBlob);

      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );

      if (isMobileDevice) {
        const viewerHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <title>Invoice - ${inv.clientName || 'View'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      background: #000;
      overflow: hidden;
    }
    .header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 60px;
      background: #1976d2;
      color: white;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      z-index: 1000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    .header h1 {
      font-size: 18px;
      font-weight: 600;
    }
    .btn {
      background: white;
      color: #1976d2;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
    }
    .btn:active {
      background: #f0f0f0;
    }
    iframe {
      position: fixed;
      top: 60px;
      left: 0;
      width: 100%;
      height: calc(100% - 60px);
      border: none;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Invoice - ${inv.clientName || 'View'}</h1>
    <a href="${pdfUrl}" download="Invoice_${inv.clientName || 'Unknown'}.pdf" class="btn">Download</a>
  </div>
  <iframe src="${pdfUrl}#toolbar=1&navpanes=0&scrollbar=1&view=FitH"></iframe>
</body>
</html>`;

        const viewerBlob = new Blob([viewerHtml], { type: 'text/html' });
        const viewerUrl = URL.createObjectURL(viewerBlob);
        const newWindow = window.open(viewerUrl, '_blank');

        if (!newWindow) {
          const link = document.createElement("a");
          link.href = pdfUrl;
          link.download = `Invoice_${inv.clientName || 'Unknown'}.pdf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          Swal.fire({
            icon: "info",
            title: "PDF Downloaded",
            text: "Check your downloads folder",
            timer: 2000,
          });
        }
      } else {
        window.open(pdfUrl, "_blank");
      }
    } catch (error) {
      console.error("PDF Generation Error:", error);
      Swal.fire("Error", "Failed to generate PDF. Please try again.", "error");
    }
  };

  const handleEdit = (invoiceId) => {
    navigate(`/invoice/${invoiceId}`);
  };

  const getColor = (status) => {
    switch ((status || "").toLowerCase()) {
      case "paid": return "success";
      case "sent": return "info";
      case "making payments": return "warning";
      case "overdue": return "error";
      default: return "warning";
    }
  };

  // Apply date filters
  const filteredInvoices = sortedInvoices.filter((inv) => {
    const invDate = getDateFromInvoice(inv);
    if (!invDate || isNaN(invDate.getTime())) return true; // Show if no date
    
    const filterStart = new Date(filters.startDate);
    const filterEnd = new Date(filters.endDate);
    
    return invDate >= filterStart && invDate <= filterEnd;
  });

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      {/* Header with Sort Dropdown */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3, flexWrap: "wrap", gap: 2 }}>
        <Typography variant="h5" sx={{ fontSize: { xs: "1.5rem", sm: "2rem" } }}>
          Invoices ({filteredInvoices.length})
        </Typography>

        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
          <Button
            variant="contained"
            color="success"
            startIcon={<GrassIcon />}
            onClick={() => setWeedDialogOpen(true)}
            sx={{ 
              fontWeight: "bold",
              boxShadow: 3,
              '&:hover': { boxShadow: 6 }
            }}
          >
            {isMobile ? <SpeedIcon /> : "Quick Weed Invoice"}
          </Button>

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Year</InputLabel>
            <Select
              value={selectedYear}
              label="Year"
              onChange={(e) => handleYearChange(e.target.value)}
            >
              <MenuItem value="all">All Years</MenuItem>
              <MenuItem value="2020">2020</MenuItem>
              <MenuItem value="2021">2021</MenuItem>
              <MenuItem value="2022">2022</MenuItem>
              <MenuItem value="2023">2023</MenuItem>
              <MenuItem value="2024">2024</MenuItem>
              <MenuItem value="2025">2025</MenuItem>
              <MenuItem value="2026">2026</MenuItem>
              <MenuItem value="2027">2027</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel id="sort-label">
            <SortIcon sx={{ fontSize: 18, mr: 0.5, verticalAlign: "middle" }} />
            Sort By
          </InputLabel>
          <Select
            labelId="sort-label"
            value={sortOrder}
            label="Sort By"
            onChange={(e) => setSortOrder(e.target.value)}
          >
            <MenuItem value="newest">Newest First</MenuItem>
            <MenuItem value="oldest">Oldest First</MenuItem>
            <MenuItem value="name-asc">Client (A-Z)</MenuItem>
            <MenuItem value="name-desc">Client (Z-A)</MenuItem>
            <MenuItem value="description-asc">Description (A-Z)</MenuItem>
            <MenuItem value="description-desc">Description (Z-A)</MenuItem>
            <MenuItem value="amount-high">Highest Amount</MenuItem>
            <MenuItem value="amount-low">Lowest Amount</MenuItem>
            <MenuItem value="status-unpaid">Unpaid First</MenuItem>
            <MenuItem value="status-paid">Paid First</MenuItem>
          </Select>
        </FormControl>
        </Box>
      </Box>

      {/* Mobile: Card Layout */}
      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
        {filteredInvoices.map((inv) => (
          <Card key={inv.id} sx={{ mb: 2, boxShadow: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
                <Box>
                  <Typography variant="h6" sx={{ fontSize: '1.1rem' }}>
                    {inv.clientName}
                  </Typography>
                  <Typography variant="h5" color="primary" sx={{ fontWeight: 700, mt: 1 }}>
                    ${inv.total || inv.amount || 0}
                  </Typography>
                  {inv.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
                      {inv.description}
                    </Typography>
                  )}
                </Box>
                <Chip
                  label={inv.status || "Pending"}
                  color={getColor(inv.status)}
                  sx={{ fontWeight: "bold" }}
                />
              </Box>

              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
                ðŸ“… Created: {formatInvoiceDate(inv)}
              </Typography>

              {/* Payment Progress */}
              {inv._paymentCount > 0 && (
                <Box sx={{ mb: 2, p: 1.5, bgcolor: inv._remainingBalance <= 0 ? '#e8f5e9' : '#fff3e0', borderRadius: 1, border: `1px solid ${inv._remainingBalance <= 0 ? '#4caf50' : '#ff9800'}` }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" fontWeight="bold">
                      💰 {inv._paymentCount} payment{inv._paymentCount !== 1 ? 's' : ''} received
                    </Typography>
                    <Typography variant="caption" fontWeight="bold" color={inv._remainingBalance <= 0 ? 'success.main' : 'warning.main'}>
                      {inv._remainingBalance <= 0 ? '✅ PAID IN FULL' : `$${inv._remainingBalance.toFixed(2)} remaining`}
                    </Typography>
                  </Box>
                  <LinearProgress 
                    variant="determinate" 
                    value={inv._percentPaid} 
                    sx={{ 
                      height: 8, 
                      borderRadius: 4,
                      bgcolor: '#e0e0e0',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: inv._percentPaid >= 100 ? '#4caf50' : '#ff9800',
                        borderRadius: 4,
                      }
                    }} 
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                    ${inv._totalPaid.toFixed(2)} of ${parseFloat(inv.total || inv.amount || 0).toFixed(2)} ({inv._percentPaid.toFixed(0)}%)
                  </Typography>
                </Box>
              )}

              <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <InputLabel>Change Status</InputLabel>
                <Select
                  value={inv.status || "Pending"}
                  label="Change Status"
                  onChange={(e) => handleStatusChange(inv.id, e.target.value)}
                >
                  <MenuItem value="Pending">Pending</MenuItem>
                  <MenuItem value="Sent">Sent</MenuItem>
                  <MenuItem value="Making Payments">Making Payments</MenuItem>
                  <MenuItem value="Paid">Paid</MenuItem>
                  <MenuItem value="Overdue">Overdue</MenuItem>
                </Select>
              </FormControl>
            </CardContent>

            <CardActions sx={{ p: 2, pt: 0, flexDirection: 'column', gap: 1 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<PictureAsPdfIcon />}
                onClick={() => handlePDF(inv)}
                fullWidth
              >
                View PDF
              </Button>
              <Button
                variant="contained"
                color="success"
                size="small"
                startIcon={<PaymentIcon />}
                onClick={() => navigate(`/payment-tracker/${inv.id}`)}
                fullWidth
              >
                Track Payments
              </Button>
              <Button
                variant="outlined"
                color="primary"
                size="small"
                startIcon={<EditIcon />}
                onClick={() => handleEdit(inv.id)}
                fullWidth
              >
                Edit Invoice
              </Button>
              <Button
                variant="outlined"
                color="error"
                size="small"
                startIcon={<DeleteIcon />}
                onClick={() => handleDelete(inv.id, inv.clientName || "this")}
                fullWidth
              >
                Delete
              </Button>
            </CardActions>
          </Card>
        ))}

        {filteredInvoices.length === 0 && (
          <Paper sx={{ p: 4, textAlign: "center" }}>
            <Typography variant="h6">No Invoices Yet</Typography>
            <Typography variant="body2" color="text.secondary">
              Invoices will appear here after you create them
            </Typography>
          </Paper>
        )}
      </Box>

      {/* Desktop: Table Layout */}
      <Paper sx={{ display: { xs: 'none', md: 'block' }, mt: 2, borderRadius: 2, overflowX: "auto", boxShadow: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Client</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Amount</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredInvoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell>{inv.clientName}</TableCell>
                <TableCell sx={{ maxWidth: 250 }}>
                  <Typography variant="body2" noWrap title={inv.description || "No description"}>
                    {inv.description || "—"}
                  </Typography>
                </TableCell>
                <TableCell>${inv.total || inv.amount || 0}</TableCell>
                <TableCell>{formatInvoiceDate(inv)}</TableCell>
                <TableCell>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: inv._paymentCount > 0 ? 1 : 0 }}>
                      <Chip
                        label={inv.status || "Pending"}
                        color={getColor(inv.status)}
                        sx={{ fontWeight: "bold" }}
                      />
                      <Select
                        size="small"
                        value={inv.status || "Pending"}
                        onChange={(e) =>
                          handleStatusChange(inv.id, e.target.value)
                        }
                        sx={{ minWidth: 120 }}
                      >
                        <MenuItem value="Pending">Pending</MenuItem>
                        <MenuItem value="Sent">Sent</MenuItem>
                        <MenuItem value="Making Payments">Making Payments</MenuItem>
                        <MenuItem value="Paid">Paid</MenuItem>
                        <MenuItem value="Overdue">Overdue</MenuItem>
                      </Select>
                    </Box>
                    {inv._paymentCount > 0 && (
                      <Box sx={{ minWidth: 180 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="caption" fontWeight="bold">
                            💰 {inv._paymentCount} payment{inv._paymentCount !== 1 ? 's' : ''}
                          </Typography>
                          <Typography variant="caption" fontWeight="bold" color={inv._remainingBalance <= 0 ? 'success.main' : 'warning.main'}>
                            {inv._remainingBalance <= 0 ? '✅ Paid' : `$${inv._remainingBalance.toFixed(2)} left`}
                          </Typography>
                        </Box>
                        <LinearProgress 
                          variant="determinate" 
                          value={inv._percentPaid} 
                          sx={{ 
                            height: 6, 
                            borderRadius: 3,
                            bgcolor: '#e0e0e0',
                            '& .MuiLinearProgress-bar': {
                              bgcolor: inv._percentPaid >= 100 ? '#4caf50' : '#ff9800',
                              borderRadius: 3,
                            }
                          }} 
                        />
                      </Box>
                    )}
                  </Box>
                </TableCell>
                <TableCell align="right">
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<PictureAsPdfIcon />}
                    onClick={() => handlePDF(inv)}
                    sx={{ mr: 1 }}
                  >
                    PDF
                  </Button>
                  <Button
                    variant="contained"
                    color="success"
                    size="small"
                    startIcon={<PaymentIcon />}
                    onClick={() => navigate(`/payment-tracker/${inv.id}`)}
                    sx={{ mr: 1 }}
                  >
                    Payments
                  </Button>
                  <Button
                    variant="outlined"
                    color="primary"
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={() => handleEdit(inv.id)}
                    sx={{ mr: 1 }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    startIcon={<DeleteIcon />}
                    onClick={() =>
                      handleDelete(inv.id, inv.clientName || "this")
                    }
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}

            {filteredInvoices.length === 0 && (
              <TableRow>
                <TableCell colSpan="5" style={{ padding: 40, textAlign: 'center' }}>
                  <Typography variant="h6" color="text.secondary">
                    No Invoices Yet
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Invoices will appear here after you create them
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      {/* ===================== QUICK WEED INVOICE DIALOG ===================== */}
      <Dialog 
        open={weedDialogOpen} 
        onClose={() => setWeedDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: "success.main", color: "white", display: "flex", alignItems: "center", gap: 1 }}>
          <GrassIcon /> Quick Weed Invoice
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Alert severity="info">
              Fast invoice creation for weed spraying jobs. Select services and customer, and we'll automatically create the invoice and add it to your calendar!
            </Alert>

            <FormControl fullWidth required>
              <InputLabel>Customer</InputLabel>
              <Select
                value={weedInvoice.customerId}
                label="Customer"
                onChange={(e) => handleCustomerSelect(e.target.value)}
              >
                {customers.map((customer) => (
                  <MenuItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Button
              variant="outlined"
              color="success"
              startIcon={<PersonAddIcon />}
              onClick={() => setAddCustomerDialogOpen(true)}
              fullWidth
            >
              Add New Customer
            </Button>

            <TextField
              label="Service Date"
              type="date"
              value={weedInvoice.serviceDate}
              onChange={(e) => handleWeedInvoiceChange("serviceDate", e.target.value)}
              fullWidth
              required
              InputLabelProps={{ shrink: true }}
              helperText="Date when weed spraying was completed"
            />

            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField
                label="Start Time"
                type="time"
                value={weedInvoice.startTime}
                onChange={(e) => handleWeedInvoiceChange("startTime", e.target.value)}
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
                helperText="When you started"
              />
              <TextField
                label="End Time"
                type="time"
                value={weedInvoice.endTime}
                onChange={(e) => handleWeedInvoiceChange("endTime", e.target.value)}
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
                helperText="When you finished"
              />
            </Box>

            <Box>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                Services:
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={weedInvoice.frontYard}
                    onChange={(e) => handleWeedInvoiceChange("frontYard", e.target.checked)}
                  />
                }
                label="Front Yard Weed Spraying - $65"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={weedInvoice.backYard}
                    onChange={(e) => handleWeedInvoiceChange("backYard", e.target.checked)}
                  />
                }
                label="Back Yard Weed Spraying - $65"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={weedInvoice.other}
                    onChange={(e) => handleWeedInvoiceChange("other", e.target.checked)}
                  />
                }
                label="Other Weed Extraction - $75"
              />
            </Box>

            {/* Photo Upload Section */}
            <Box>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                📷 Photos (Optional):
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Add before and after photos to document the work completed
              </Typography>

              {/* Before Photo */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" fontWeight="bold" gutterBottom>
                  Before Photo:
                </Typography>
                {weedInvoice.beforePhotoURL ? (
                  <Box sx={{ position: 'relative', display: 'inline-block' }}>
                    <img 
                      src={weedInvoice.beforePhotoURL} 
                      alt="Before" 
                      style={{ 
                        maxWidth: '100%', 
                        maxHeight: '200px',
                        borderRadius: '8px',
                        border: '2px solid #4caf50'
                      }} 
                    />
                    <Button
                      variant="contained"
                      color="error"
                      size="small"
                      onClick={() => handleRemovePhoto('before')}
                      sx={{ 
                        position: 'absolute', 
                        top: 8, 
                        right: 8,
                        minWidth: 'auto',
                        padding: '4px 8px'
                      }}
                    >
                      Remove
                    </Button>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant="outlined"
                      color="success"
                      startIcon={<CameraAltIcon />}
                      component="label"
                      size="small"
                    >
                      Take Photo
                      <input
                        hidden
                        accept="image/*"
                        type="file"
                        capture="environment"
                        onChange={(e) => handlePhotoSelect('before', e)}
                      />
                    </Button>
                    <Button
                      variant="outlined"
                      color="success"
                      startIcon={<PhotoLibraryIcon />}
                      component="label"
                      size="small"
                    >
                      Choose Photo
                      <input
                        hidden
                        accept="image/*"
                        type="file"
                        onChange={(e) => handlePhotoSelect('before', e)}
                      />
                    </Button>
                  </Box>
                )}
              </Box>

              {/* After Photo */}
              <Box>
                <Typography variant="body2" fontWeight="bold" gutterBottom>
                  After Photo:
                </Typography>
                {weedInvoice.afterPhotoURL ? (
                  <Box sx={{ position: 'relative', display: 'inline-block' }}>
                    <img 
                      src={weedInvoice.afterPhotoURL} 
                      alt="After" 
                      style={{ 
                        maxWidth: '100%', 
                        maxHeight: '200px',
                        borderRadius: '8px',
                        border: '2px solid #4caf50'
                      }} 
                    />
                    <Button
                      variant="contained"
                      color="error"
                      size="small"
                      onClick={() => handleRemovePhoto('after')}
                      sx={{ 
                        position: 'absolute', 
                        top: 8, 
                        right: 8,
                        minWidth: 'auto',
                        padding: '4px 8px'
                      }}
                    >
                      Remove
                    </Button>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant="outlined"
                      color="success"
                      startIcon={<CameraAltIcon />}
                      component="label"
                      size="small"
                    >
                      Take Photo
                      <input
                        hidden
                        accept="image/*"
                        type="file"
                        capture="environment"
                        onChange={(e) => handlePhotoSelect('after', e)}
                      />
                    </Button>
                    <Button
                      variant="outlined"
                      color="success"
                      startIcon={<PhotoLibraryIcon />}
                      component="label"
                      size="small"
                    >
                      Choose Photo
                      <input
                        hidden
                        accept="image/*"
                        type="file"
                        onChange={(e) => handlePhotoSelect('after', e)}
                      />
                    </Button>
                  </Box>
                )}
              </Box>
            </Box>

            {/* Payment Collection Section */}
            <Box>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                💵 Payment Collection:
              </Typography>
              <FormControl fullWidth>
                <InputLabel>Payment Method</InputLabel>
                <Select
                  value={weedInvoice.paymentMethod}
                  label="Payment Method"
                  onChange={(e) => handleWeedInvoiceChange("paymentMethod", e.target.value)}
                >
                  <MenuItem value="">Not Collected Yet</MenuItem>
                  <MenuItem value="cash">Cash</MenuItem>
                  <MenuItem value="zelle">Zelle</MenuItem>
                  <MenuItem value="check">Check</MenuItem>
                  <MenuItem value="other">Other</MenuItem>
                </Select>
              </FormControl>
              {weedInvoice.paymentMethod && (
                <Alert severity="success" sx={{ mt: 1 }}>
                  ✅ Invoice will be marked as PAID and payment recorded
                </Alert>
              )}
              {!weedInvoice.paymentMethod && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  Invoice will be marked as SENT (awaiting payment)
                </Alert>
              )}
            </Box>

            <Paper sx={{ p: 2, bgcolor: "success.light" }}>
              <Typography variant="h6" fontWeight="bold" textAlign="center">
                Total: ${calculateWeedTotal()}
              </Typography>
            </Paper>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWeedDialogOpen(false)}>
            Cancel
          </Button>
          <Button 
            variant="contained" 
            color="success"
            onClick={handleCreateWeedInvoice}
            startIcon={<GrassIcon />}
			disabled={!weedInvoice.customerId || calculateWeedTotal() === 0}
          >
            Create Invoice
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===================== QUICK ADD CUSTOMER DIALOG ===================== */}
      <Dialog 
        open={addCustomerDialogOpen} 
        onClose={() => setAddCustomerDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: "primary.main", color: "white", display: "flex", alignItems: "center", gap: 1 }}>
          <PersonAddIcon /> Quick Add Customer
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Alert severity="info">
              Add a new customer quickly. Name is required, other fields are optional.
            </Alert>

            <TextField
              label="Customer Name"
              value={newCustomer.name}
              onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
              fullWidth
              required
              autoFocus
              helperText="Required"
            />

            <TextField
              label="Phone Number"
              value={newCustomer.phone}
              onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
              fullWidth
              placeholder="(555) 123-4567"
              helperText="Optional"
            />

            <TextField
              label="Email"
              type="email"
              value={newCustomer.email}
              onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
              fullWidth
              placeholder="customer@email.com"
              helperText="Optional"
            />

            <TextField
              label="Address"
              value={newCustomer.address}
              onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
              fullWidth
              multiline
              rows={2}
              placeholder="123 Main St, Bullhead City, AZ"
              helperText="Optional"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddCustomerDialogOpen(false)}>
            Cancel
          </Button>
          <Button 
            variant="contained" 
            color="primary"
            onClick={handleQuickAddCustomer}
            startIcon={<PersonAddIcon />}
          >
            Add Customer
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}