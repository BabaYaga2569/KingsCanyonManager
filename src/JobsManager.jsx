import React, { useState, useEffect, useRef } from "react";
import {
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";
import { useAuth } from "./AuthProvider";
import { logAction, AUDIT_ACTIONS } from "./utils/auditLog";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Card,
  CardContent,
  CardActions,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Checkbox,
  ListItemText,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Badge,
  InputAdornment,
} from "@mui/material";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import CloseIcon from "@mui/icons-material/Close";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";
import EditIcon from "@mui/icons-material/Edit";
import SortIcon from "@mui/icons-material/Sort";
import FilterListIcon from "@mui/icons-material/FilterList";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PersonIcon from "@mui/icons-material/Person";
import DownloadIcon from "@mui/icons-material/Download";
import SearchIcon from "@mui/icons-material/Search";
import ArchiveIcon from "@mui/icons-material/Archive";
import UnarchiveIcon from "@mui/icons-material/Unarchive";
import { exportJobsToExcel, exportJobsToCSV } from "./utils/kclExportUtils";
import Swal from "sweetalert2";
import { markAsViewed } from "./useNotificationCounts";

export default function JobsManager() {
  const { user, userRole } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [sortedJobs, setSortedJobs] = useState([]);
  const [sortOrder, setSortOrder] = useState("oldest");
  const [jobTypeFilter, setJobTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [invoiceMap, setInvoiceMap] = useState({});   // jobId -> invoice
  const [paymentMap, setPaymentMap] = useState({});   // invoiceId -> {totalPaid, balance}
  const [customerMap, setCustomerMap] = useState({});
  const [archiveFilter, setArchiveFilter] = useState("active");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedClients, setExpandedClients] = useState({});
  const [cameraOpen, setCameraOpen] = useState(false);
  const [currentJob, setCurrentJob] = useState(null);
  const [photoType, setPhotoType] = useState("");
  const [capturedImage, setCapturedImage] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [editForm, setEditForm] = useState({
    clientName: "",
    description: "",
    amount: "",
    status: "",
    startDate: "",
    completionDate: "",
    notes: "",
    assignedEmployees: [],
  });

  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const normalizeStatus = (status) => (status || "").trim().toLowerCase();

  const isArchived = (job) => job?.archived === true;

  const getJobDate = (job) => {
    const raw = job?.createdAt || job?.startDate || 0;
    if (raw?.toDate) return raw.toDate();
    return new Date(raw);
  };

  const formatJobDate = (rawDate) => {
    try {
      const date = rawDate?.toDate ? rawDate.toDate() : new Date(rawDate);
      if (Number.isNaN(date.getTime())) return "Unknown";
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "Unknown";
    }
  };

  const getJobAgeDays = (job) => {
    try {
      const created = getJobDate(job);
      if (!(created instanceof Date) || Number.isNaN(created.getTime())) return null;
      return Math.floor((Date.now() - created.getTime()) / 86400000);
    } catch {
      return null;
    }
  };

  const getStaleLevel = (job) => {
    const age = getJobAgeDays(job);
    if (age == null) return null;
    if (age >= 90) return "very-stale";
    if (age >= 30) return "stale";
    return null;
  };

  const compareJobs = (a, b, currentSortOrder) => {
    switch (currentSortOrder) {
      case "newest":
        return getJobDate(b) - getJobDate(a);

      case "oldest":
        return getJobDate(a) - getJobDate(b);

      case "name-asc":
        return (a.clientName || "").localeCompare(b.clientName || "");

      case "name-desc":
        return (b.clientName || "").localeCompare(a.clientName || "");

      case "status-active": {
        const aIsMatch = normalizeStatus(a.status) === "active";
        const bIsMatch = normalizeStatus(b.status) === "active";
        if (aIsMatch && !bIsMatch) return -1;
        if (!aIsMatch && bIsMatch) return 1;
        return getJobDate(a) - getJobDate(b);
      }

      case "status-completed": {
        const aIsMatch = normalizeStatus(a.status) === "completed";
        const bIsMatch = normalizeStatus(b.status) === "completed";
        if (aIsMatch && !bIsMatch) return -1;
        if (!aIsMatch && bIsMatch) return 1;
        return getJobDate(a) - getJobDate(b);
      }

      case "status-pending": {
        const aIsMatch = normalizeStatus(a.status) === "pending";
        const bIsMatch = normalizeStatus(b.status) === "pending";
        if (aIsMatch && !bIsMatch) return -1;
        if (!aIsMatch && bIsMatch) return 1;
        return getJobDate(a) - getJobDate(b);
      }

      default:
        return getJobDate(a) - getJobDate(b);
    }
  };

  const compareClientGroups = ([clientA, jobsA], [clientB, jobsB], currentSortOrder) => {
    switch (currentSortOrder) {
      case "name-asc":
        return clientA.localeCompare(clientB);

      case "name-desc":
        return clientB.localeCompare(clientA);

      case "status-active": {
        const aCount = jobsA.filter((job) => normalizeStatus(job.status) === "active").length;
        const bCount = jobsB.filter((job) => normalizeStatus(job.status) === "active").length;
        if (aCount !== bCount) return bCount - aCount;
        return clientA.localeCompare(clientB);
      }

      case "status-completed": {
        const aCount = jobsA.filter((job) => normalizeStatus(job.status) === "completed").length;
        const bCount = jobsB.filter((job) => normalizeStatus(job.status) === "completed").length;
        if (aCount !== bCount) return bCount - aCount;
        return clientA.localeCompare(clientB);
      }

      case "status-pending": {
        const aCount = jobsA.filter((job) => normalizeStatus(job.status) === "pending").length;
        const bCount = jobsB.filter((job) => normalizeStatus(job.status) === "pending").length;
        if (aCount !== bCount) return bCount - aCount;
        return clientA.localeCompare(clientB);
      }

      case "newest": {
        const newestA = [...jobsA].sort((a, b) => getJobDate(b) - getJobDate(a))[0];
        const newestB = [...jobsB].sort((a, b) => getJobDate(b) - getJobDate(a))[0];
        return getJobDate(newestB) - getJobDate(newestA);
      }

      case "oldest":
      default: {
        const oldestA = [...jobsA].sort((a, b) => getJobDate(a) - getJobDate(b))[0];
        const oldestB = [...jobsB].sort((a, b) => getJobDate(a) - getJobDate(b))[0];
        return getJobDate(oldestA) - getJobDate(oldestB);
      }
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  useEffect(() => {
    markAsViewed("jobs");
  }, []);

  useEffect(() => {
    let filtered = [...jobs];

    if (archiveFilter === "active") {
      filtered = filtered.filter((job) => !isArchived(job));
    } else if (archiveFilter === "archived") {
      filtered = filtered.filter((job) => isArchived(job));
    }

    if (jobTypeFilter !== "all") {
      filtered = filtered.filter((job) => job.jobType === jobTypeFilter);
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter(
        (job) => normalizeStatus(job.status) === normalizeStatus(statusFilter)
      );
    }

    const search = searchTerm.trim().toLowerCase();

    if (search) {
      filtered = filtered.filter((job) => {
        const searchableText = [
          job.clientName,
          job.description,
          job.notes,
          job.jobType,
          job.status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(search);
      });
    }

    const sorted = [...filtered].sort((a, b) => compareJobs(a, b, sortOrder));
    setSortedJobs(sorted);
  }, [jobs, sortOrder, jobTypeFilter, statusFilter, archiveFilter, searchTerm]);

  const fetchJobs = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "jobs"));
      const jobList = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setJobs(jobList);

      const usersSnap = await getDocs(collection(db, "users"));
      const activeEmployees = usersSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((user) => user.active !== false);
      setEmployees(activeEmployees);

      // Load customers for address display on job cards
      try {
        const customersSnap = await getDocs(collection(db, "customers"));
        const custMap = {};
        customersSnap.docs.forEach(d => {
          const c = d.data();
          const addressParts = [c.address, c.city, c.state, c.zip].filter(Boolean);
          custMap[d.id] = { address: addressParts.join(", ") };
        });
        setCustomerMap(custMap);
      } catch (e) {
        console.warn("Could not load customers:", e);
      }

      // Load invoices and payments to show payment status on job cards
      try {
        const invoicesSnap = await getDocs(collection(db, "invoices"));
        const allInvoices = invoicesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const invMap = {};
        allInvoices.forEach(inv => { if (inv.jobId) invMap[inv.jobId] = inv; });
        setInvoiceMap(invMap);

        const paymentsSnap = await getDocs(collection(db, "payments"));
        const allPayments = paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const pmtMap = {};
        allInvoices.forEach(inv => {
          const invPayments = allPayments.filter(p => p.invoiceId === inv.id);
          const totalPaid = invPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
          const invoiceTotal = parseFloat(inv.total || inv.amount || 0);
          pmtMap[inv.id] = {
            totalPaid,
            balance: Math.max(0, invoiceTotal - totalPaid),
            isPaid: totalPaid >= invoiceTotal && invoiceTotal > 0,
            paymentCount: invPayments.length,
          };
        });
        setPaymentMap(pmtMap);
      } catch (e) {
        console.warn("Could not load invoices/payments for job cards:", e);
      }
    } catch (error) {
      console.error("Error fetching jobs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleArchiveJob = async (job) => {
    const result = await Swal.fire({
      title: `Archive ${job.clientName}'s job?`,
      text: "This job will be hidden from the default jobs view, but not deleted.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Archive",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#ed6c02",
    });

    if (!result.isConfirmed) return;

    try {
      await updateDoc(doc(db, "jobs", job.id), {
        archived: true,
        archivedAt: serverTimestamp(),
      });

      setJobs((prev) =>
        prev.map((j) =>
          j.id === job.id ? { ...j, archived: true, archivedAt: new Date() } : j
        )
      );

      Swal.fire("Archived!", "Job has been archived.", "success");
    } catch (error) {
      console.error("Error archiving job:", error);
      Swal.fire("Error", "Failed to archive job.", "error");
    }
  };

  const handleRestoreJob = async (job) => {
    try {
      await updateDoc(doc(db, "jobs", job.id), {
        archived: false,
        archivedAt: null,
      });

      setJobs((prev) =>
        prev.map((j) =>
          j.id === job.id ? { ...j, archived: false, archivedAt: null } : j
        )
      );

      Swal.fire("Restored!", "Job has been restored.", "success");
    } catch (error) {
      console.error("Error restoring job:", error);
      Swal.fire("Error", "Failed to restore job.", "error");
    }
  };

  const handleStatusChange = async (jobId, newStatus) => {
    try {
      const job = jobs.find(j => j.id === jobId);

      // ── Gate: cannot activate without a schedule ─────────────────────────
      if (newStatus === 'Active') {
        // Check schedules collection for any entry linked to this job's contract
        let hasSchedule = false;

        if (job?.contractId) {
          const schedSnap = await getDocs(
            query(collection(db, 'schedules'), where('contractId', '==', job.contractId))
          );
          if (!schedSnap.empty) hasSchedule = true;
        }

        // Also check by jobId directly in case schedules link that way
        if (!hasSchedule && job?.id) {
          const schedSnap2 = await getDocs(
            query(collection(db, 'schedules'), where('jobId', '==', job.id))
          );
          if (!schedSnap2.empty) hasSchedule = true;
        }

        // Also check if the job itself has a scheduledDate set
        if (!hasSchedule && job?.scheduledDate) hasSchedule = true;

        if (!hasSchedule) {
          Swal.fire({
            icon: 'warning',
            title: 'Cannot Activate Job',
            html: `
              <p>This job must be scheduled before it can be activated.</p>
              <p style="margin-top:12px; color:#555;">
                <strong>Required:</strong> Go to <strong>Schedule</strong>, assign a date and crew to this job, then come back to activate it.
              </p>
              <p style="margin-top:8px; color:#1565c0; font-size:0.9em;">
                This ensures crew always has a confirmed schedule before showing up on site.
              </p>
            `,
            confirmButtonText: 'Go to Schedule',
            showCancelButton: true,
            cancelButtonText: 'OK',
            confirmButtonColor: '#1565c0',
          }).then(result => {
            if (result.isConfirmed) window.location.href = '/schedule-dashboard';
          });
          return;
        }
      }
      // ────────────────────────────────────────────────────────────────────

      await updateDoc(doc(db, "jobs", jobId), { status: newStatus });
      await logAction(AUDIT_ACTIONS.JOB_STATUS_CHANGED, { jobId, clientName: job?.clientName, oldStatus: job?.status, newStatus }, user, userRole);
      setJobs((prev) =>
        prev.map((job) =>
          job.id === jobId ? { ...job, status: newStatus } : job
        )
      );
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const handleJobTypeChange = async (jobId, newJobType) => {
    try {
      const job = jobs.find(j => j.id === jobId);
      await updateDoc(doc(db, "jobs", jobId), { jobType: newJobType });
      await logAction(AUDIT_ACTIONS.JOB_TYPE_CHANGED, { jobId, clientName: job?.clientName, newJobType }, user, userRole);
      setJobs((prev) =>
        prev.map((job) =>
          job.id === jobId ? { ...job, jobType: newJobType } : job
        )
      );

      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Job type updated!",
        showConfirmButton: false,
        timer: 2000,
      });
    } catch (error) {
      console.error("Error updating job type:", error);
      Swal.fire("Error", "Failed to update job type.", "error");
    }
  };

  const handleDeleteJob = async (jobId, clientName) => {
    const confirm = await Swal.fire({
      title: `Delete ${clientName}'s job?`,
      text: "This will permanently remove this job and all its photos.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it",
      cancelButtonText: "Cancel",
    });

    if (!confirm.isConfirmed) return;

    try {
      await deleteDoc(doc(db, "jobs", jobId));
      await logAction(AUDIT_ACTIONS.JOB_DELETED, { jobId, clientName }, user, userRole);
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      Swal.fire("Deleted!", "Job has been removed.", "success");
    } catch (error) {
      console.error("Error deleting job:", error);
      Swal.fire("Error", "Failed to delete job.", "error");
    }
  };

  const handleViewPhotos = (job) => {
    setCurrentJob(job);
    const beforePhotos = job.beforePhotos || [];
    const afterPhotos = job.afterPhotos || [];

    if (beforePhotos.length === 0 && afterPhotos.length === 0) {
      Swal.fire("No Photos", "This job has no photos yet.", "info");
      return;
    }

    const photoHTML = `
      <div style="max-height: 500px; overflow-y: auto; padding: 10px;">
        ${beforePhotos.length > 0 ? '<h3 style="color: #1976d2;">Before Photos:</h3>' : ""}
        ${beforePhotos.map((url, i) => `
          <div style="margin: 15px 0;">
            <p style="font-weight: bold;">Before Photo ${i + 1} 
              <button 
                onclick="window.deletePhoto('${url}', 'before')"
                style="background: #f44336; color: white; border: none; border-radius: 4px; padding: 4px 12px; margin-left: 10px; cursor: pointer; font-size: 12px;"
              >Delete</button>
            </p>
            <img src="${url}" 
                 style="width: 100%; max-width: 400px; border-radius: 8px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"
                 onclick="window.open('${url}', '_blank')" />
          </div>
        `).join("")}
        
        ${afterPhotos.length > 0 ? '<h3 style="color: #2e7d32; margin-top: 20px;">After Photos:</h3>' : ""}
        ${afterPhotos.map((url, i) => `
          <div style="margin: 15px 0;">
            <p style="font-weight: bold;">After Photo ${i + 1}
              <button 
                onclick="window.deletePhoto('${url}', 'after')"
                style="background: #f44336; color: white; border: none; border-radius: 4px; padding: 4px 12px; margin-left: 10px; cursor: pointer; font-size: 12px;"
              >Delete</button>
            </p>
            <img src="${url}" 
                 style="width: 100%; max-width: 400px; border-radius: 8px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"
                 onclick="window.open('${url}', '_blank')" />
          </div>
        `).join("")}
      </div>
      <p style="margin-top: 20px; font-size: 14px; color: #666; text-align: center;">
        Tap photo to view full size | Red button to delete
      </p>
    `;

    window.deletePhoto = async (photoUrl, photoType) => {
      Swal.close();
      await handleDeletePhoto(photoUrl, photoType);
      setTimeout(() => {
        const updatedJob = jobs.find((j) => j.id === job.id);
        if (updatedJob) handleViewPhotos(updatedJob);
      }, 500);
    };

    Swal.fire({
      title: `${job.clientName} - Photos`,
      html: photoHTML,
      width: "90%",
      showCloseButton: true,
      showConfirmButton: false,
    });
  };

  const handleOpenEditDialog = (job) => {
    setEditingJob(job);
    setEditForm({
      clientName: job.clientName || "",
      description: job.description || "",
      amount: job.amount || "",
      status: job.status || "",
      startDate: job.startDate || "",
      completionDate: job.completionDate || "",
      notes: job.notes || "",
      assignedEmployees: job.assignedEmployees || [],
    });
    setEditDialogOpen(true);
  };

  const handleCloseEditDialog = () => {
    setEditDialogOpen(false);
    setEditingJob(null);
    setEditForm({
      clientName: "",
      description: "",
      amount: "",
      status: "",
      startDate: "",
      completionDate: "",
      notes: "",
      assignedEmployees: [],
    });
  };

  const handleSaveEdit = async () => {
    if (!editingJob) return;

    try {
      await updateDoc(doc(db, "jobs", editingJob.id), editForm);
      setJobs((prev) =>
        prev.map((job) =>
          job.id === editingJob.id ? { ...job, ...editForm } : job
        )
      );
      Swal.fire("Updated!", "Job details have been saved.", "success");
      handleCloseEditDialog();
    } catch (error) {
      console.error("Error updating job:", error);
      Swal.fire("Error", "Failed to update job.", "error");
    }
  };

  const handleOpenCamera = async (type, job) => {
    setCurrentJob(job);
    setPhotoType(type);
    setCapturedImage(null);
    setCameraOpen(true);
  };

  const handleCloseCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
    setCurrentJob(null);
    setPhotoType("");
    setCapturedImage(null);
  };

  const startCamera = async () => {
    try {
      console.log("🎥 Starting camera...");

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera not supported on this device");
      }

      const constraints = {
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      console.log("📱 Requesting camera access...");
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("✅ Camera stream obtained");

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        videoRef.current.setAttribute("autoplay", "true");
        videoRef.current.muted = true;

        try {
          await videoRef.current.play();
          console.log("✅ Video playing");
        } catch (playError) {
          console.log("⚠️ Auto-play failed, trying manual play");
          videoRef.current.play().catch((e) => console.error("Play error:", e));
        }
      }
    } catch (error) {
      console.error("❌ Camera error:", error.name, error.message);

      try {
        console.log("🔄 Trying fallback camera...");
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true");
          videoRef.current.setAttribute("autoplay", "true");
          videoRef.current.muted = true;
          await videoRef.current.play();
          console.log("✅ Fallback camera working");
        }
      } catch (fallbackError) {
        console.error("❌ Fallback camera error:", fallbackError);

        let errorMessage = "Could not access camera. ";
        if (fallbackError.name === "NotAllowedError" || fallbackError.name === "PermissionDeniedError") {
          errorMessage += "Please allow camera permissions in your browser settings.";
        } else if (fallbackError.name === "NotFoundError") {
          errorMessage += "No camera found on this device.";
        } else {
          errorMessage += "Please check your device settings.";
        }

        Swal.fire("Camera Error", errorMessage, "error");
        handleCloseCamera();
      }
    }
  };

  useEffect(() => {
    if (cameraOpen && videoRef.current) {
      startCamera();
    }
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraOpen]);

  const handleCapturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    setCapturedImage(dataUrl);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setCapturedImage(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadPhoto = async () => {
    if (!capturedImage || !currentJob) return;

    setUploading(true);
    try {
      const blob = await (await fetch(capturedImage)).blob();
      const fileName = `${currentJob.id}_${photoType}_${Date.now()}.jpg`;
      const storageRef = ref(storage, `job-photos/${fileName}`);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);

      const field = photoType === "before" ? "beforePhotos" : "afterPhotos";
      const currentPhotos = currentJob[field] || [];
      const updatedPhotos = [...currentPhotos, url];

      await updateDoc(doc(db, "jobs", currentJob.id), {
        [field]: updatedPhotos,
      });

      setJobs((prev) =>
        prev.map((job) =>
          job.id === currentJob.id
            ? { ...job, [field]: updatedPhotos }
            : job
        )
      );

      Swal.fire("Success!", "Photo uploaded.", "success");
      handleCloseCamera();
    } catch (error) {
      console.error("Upload error:", error);

      let errorDetails = `Error: ${error.message || "Unknown error"}\n\n`;

      if (error.code) {
        errorDetails += `Code: ${error.code}\n\n`;
      }

      if (error.code === "storage/unauthorized") {
        errorDetails += "This means Firebase Storage permissions are blocking the upload.\n\nFix: Go to Firebase Console → Storage → Rules";
      } else if (error.code === "storage/canceled") {
        errorDetails += "Upload was cancelled.";
      } else if (error.name) {
        errorDetails += `Type: ${error.name}`;
      }

      Swal.fire({
        title: "Upload Failed",
        text: errorDetails,
        icon: "error",
        confirmButtonText: "OK",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePhoto = async (photoUrl, photoType) => {
    const result = await Swal.fire({
      title: "Delete Photo?",
      text: "This cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Delete",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    try {
      const field = photoType === "before" ? "beforePhotos" : "afterPhotos";
      const currentPhotos = currentJob[field] || [];
      const updatedPhotos = currentPhotos.filter((url) => url !== photoUrl);

      await updateDoc(doc(db, "jobs", currentJob.id), {
        [field]: updatedPhotos,
      });

      setJobs((prev) =>
        prev.map((job) =>
          job.id === currentJob.id
            ? { ...job, [field]: updatedPhotos }
            : job
        )
      );

      Swal.fire("Deleted!", "Photo has been deleted.", "success");
    } catch (error) {
      console.error("Delete error:", error);
      Swal.fire("Error", "Failed to delete photo.", "error");
    }
  };

  const getStatusColor = (status) => {
    switch (normalizeStatus(status)) {
      case "active":
        return "success";
      case "pending":
        return "warning";
      case "completed":
        return "info";
      case "cancelled":
        return "error";
      default:
        return "default";
    }
  };

  if (loading) {
    return (
      <Typography sx={{ mt: 4, textAlign: "center" }}>
        Loading jobs...
      </Typography>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3, flexWrap: "wrap", gap: 2 }}>
        <Typography variant="h6" sx={{ fontSize: { xs: "1.5rem", sm: "2rem" } }}>
          Jobs ({sortedJobs.length})
        </Typography>

        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          <TextField
            size="small"
            placeholder="Search client, description, type, status..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ minWidth: { xs: "100%", sm: 300 } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="archive-filter-label">Archive View</InputLabel>
            <Select
              labelId="archive-filter-label"
              value={archiveFilter}
              label="Archive View"
              onChange={(e) => setArchiveFilter(e.target.value)}
            >
              <MenuItem value="active">Active Jobs</MenuItem>
              <MenuItem value="archived">Archived Jobs</MenuItem>
              <MenuItem value="all">All Jobs</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="filter-label">
              <FilterListIcon sx={{ fontSize: 18, mr: 0.5, verticalAlign: "middle" }} />
              Filter by Type
            </InputLabel>
            <Select
              labelId="filter-label"
              value={jobTypeFilter}
              label="Filter by Type"
              onChange={(e) => setJobTypeFilter(e.target.value)}
            >
              <MenuItem value="all">All Jobs</MenuItem>
              <MenuItem value="Quick Weed Service">Quick Weed Service</MenuItem>
              <MenuItem value="Maintenance">Maintenance</MenuItem>
              <MenuItem value="General Service">General Service</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="status-filter-label">Filter by Status</InputLabel>
            <Select
              labelId="status-filter-label"
              value={statusFilter}
              label="Filter by Status"
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <MenuItem value="all">All Statuses</MenuItem>
              <MenuItem value="Active">Active</MenuItem>
              <MenuItem value="Pending">Pending</MenuItem>
              <MenuItem value="Completed">Completed</MenuItem>
              <MenuItem value="Cancelled">Cancelled</MenuItem>
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
              <MenuItem value="name-asc">Name (A-Z)</MenuItem>
              <MenuItem value="name-desc">Name (Z-A)</MenuItem>
              <MenuItem value="status-active">Active First</MenuItem>
              <MenuItem value="status-completed">Completed First</MenuItem>
              <MenuItem value="status-pending">Pending First</MenuItem>
            </Select>
          </FormControl>

          <Button
            variant="outlined"
            size="small"
            startIcon={<DownloadIcon />}
            onClick={() => exportJobsToExcel(sortedJobs)}
          >
            Excel
          </Button>

          <Button
            variant="outlined"
            size="small"
            startIcon={<DownloadIcon />}
            onClick={() => exportJobsToCSV(sortedJobs)}
          >
            CSV
          </Button>
        </Box>
      </Box>

      {sortedJobs.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <Typography variant="h6" color="text.secondary">No Jobs Found</Typography>
          <Typography variant="body2" color="text.secondary">
            {searchTerm
              ? "No jobs match your search."
              : jobTypeFilter !== "all" || statusFilter !== "all" || archiveFilter !== "active"
                ? "No jobs found for the selected filters. Try changing the filters."
                : "Jobs will appear here after you create them"}
          </Typography>
        </Box>
      ) : (() => {
        const groups = sortedJobs.reduce((acc, job) => {
          const key = job.clientName || "Unknown Client";
          if (!acc[key]) acc[key] = [];
          acc[key].push(job);
          return acc;
        }, {});

        return Object.entries(groups)
          .map(([clientName, clientJobs]) => [
            clientName,
            [...clientJobs].sort((a, b) => compareJobs(a, b, sortOrder)),
          ])
          .sort((a, b) => compareClientGroups(a, b, sortOrder))
          .map(([clientName, clientJobs]) => {
            const isExpanded = expandedClients[clientName] !== false;
            const hasMultiple = clientJobs.length > 1;
            const activeCount = clientJobs.filter((j) => normalizeStatus(j.status) === "active").length;
            const pendingCount = clientJobs.filter((j) => normalizeStatus(j.status) === "pending").length;

            return (
              <Accordion
                key={clientName}
                expanded={isExpanded}
                onChange={() => setExpandedClients((prev) => ({ ...prev, [clientName]: !isExpanded }))}
                sx={{ mb: 1.5, boxShadow: 2, borderRadius: "8px !important", "&:before": { display: "none" } }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{ backgroundColor: "#f5f5f5", borderRadius: "8px", minHeight: 56 }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, width: "100%", pr: 1 }}>
                    <PersonIcon color="primary" />
                    <Typography variant="h6" sx={{ fontSize: "1rem", fontWeight: 700, flex: 1 }}>
                      {clientName}
                    </Typography>
                    <Badge badgeContent={clientJobs.length} color="primary" sx={{ mr: 1 }}>
                      <Chip label={`${clientJobs.length} job${clientJobs.length > 1 ? "s" : ""}`} size="small" />
                    </Badge>
                    {activeCount > 0 && <Chip label={`${activeCount} Active`} size="small" color="success" />}
                    {pendingCount > 0 && <Chip label={`${pendingCount} Pending`} size="small" color="warning" />}
                  </Box>
                </AccordionSummary>

                <AccordionDetails sx={{ p: 2 }}>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", sm: "repeat(auto-fit, minmax(300px, 1fr))" },
                      gap: 2,
                    }}
                  >
                    {clientJobs.map((job, jobIndex) => {
                      const jobLabel = hasMultiple
                        ? `Job #${jobIndex + 1} — ${(() => {
                            const raw = job.serviceDate || job.startDate || job.createdAt;
                            if (!raw) return "No date";
                            try {
                              const d = raw?.toDate ? raw.toDate() : new Date(raw);
                              return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                            } catch {
                              return "No date";
                            }
                          })()}`
                        : null;

                      const ageDays = getJobAgeDays(job);
                      const staleLevel = getStaleLevel(job);
                      const archived = isArchived(job);

                      return (
                        <Card key={job.id} sx={{ boxShadow: 1, border: hasMultiple ? "1px solid #e0e0e0" : "none", opacity: archived ? 0.88 : 1 }}>
                          <CardContent>
                            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start", mb: 1.5 }}>
                              <Box>
                                {jobLabel && (
                                  <Typography variant="caption" color="primary" fontWeight="bold" display="block">
                                    {jobLabel}
                                  </Typography>
                                )}
                                <Typography variant="body1" fontWeight="bold">
                                  {job.jobType || "General Service"}
                                </Typography>

                                {job.createdAt && (
                                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                                    Created: {formatJobDate(job.createdAt)}
                                    {ageDays != null ? ` • ${ageDays} day${ageDays === 1 ? "" : "s"} old` : ""}
                                  </Typography>
                                )}

                                <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
                                  {archived && (
                                    <Chip label="Archived" size="small" color="default" variant="outlined" />
                                  )}
                                  {staleLevel === "stale" && (
                                    <Chip label="30+ days old" size="small" color="warning" variant="outlined" />
                                  )}
                                  {staleLevel === "very-stale" && (
                                    <Chip label="90+ days old" size="small" color="error" variant="outlined" />
                                  )}
                                </Box>
                              </Box>

                              <Chip label={job.status || "Pending"} color={getStatusColor(job.status)} size="small" />
                            </Box>

                            {(job.description || job.notes) ? (
                              <Box sx={{ mb: 2, p: 1.5, bgcolor: "#f0f4ff", borderRadius: 1, borderLeft: "3px solid #1976d2" }}>
                                <Typography variant="caption" color="primary" fontWeight="bold" display="block" gutterBottom>
                                  Job Description
                                </Typography>
                                <Typography
                                  variant="body2"
                                  color="text.primary"
                                  sx={{
                                    display: "-webkit-box",
                                    WebkitLineClamp: 3,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                    whiteSpace: "pre-wrap",
                                  }}
                                >
                                  {job.description || job.notes}
                                </Typography>
                                {(job.description || job.notes || "").length > 150 && (
                                  <Typography variant="caption" color="text.secondary">
                                    (tap Edit Job to see full description)
                                  </Typography>
                                )}
                              </Box>
                            ) : (
                              <Box sx={{ mb: 2, p: 1, bgcolor: "#fff8e1", borderRadius: 1, borderLeft: "3px solid #ff9800" }}>
                                <Typography variant="caption" color="warning.dark">
                                  ⚠️ No description — add one via Edit Job
                                </Typography>
                              </Box>
                            )}

                            {/* Address box */}
                            {(() => {
                              const customer = customerMap[job.customerId];
                              const addr = customer?.address || job.address || job.clientAddress || null;
                              if (!addr) return null;
                              return (
                                <Box sx={{ mb: 2, p: 1, bgcolor: "#f3f8ff", borderRadius: 1, borderLeft: "3px solid #42a5f5", display: "flex", alignItems: "center", gap: 1 }}>
                                  <Typography variant="caption" sx={{ fontSize: "0.78rem" }}>
                                    📍 {addr}
                                  </Typography>
                                </Box>
                              );
                            })()}

                            {(() => {
                              const inv = invoiceMap[job.id];
                              const pmt = inv ? paymentMap[inv.id] : null;
                              const revenue = inv ? parseFloat(inv.total || inv.amount || 0) : parseFloat(job.amount || 0);
                              const materials = parseFloat(job.totalExpenses || 0);
                              const hasRevenue = revenue > 0;

                              // Payment status chip
                              const paymentChip = pmt && pmt.paymentCount > 0 ? (
                                <Box sx={{ mb: 1, p: 1, bgcolor: pmt.isPaid ? "#e8f5e9" : "#fff8e1", borderRadius: 1, borderLeft: `3px solid ${pmt.isPaid ? "#4caf50" : "#ff9800"}`, display: "flex", justifyContent: "space-between" }}>
                                  <Typography variant="caption" fontWeight="bold" color={pmt.isPaid ? "success.main" : "warning.dark"}>
                                    {pmt.isPaid ? "✅ PAID IN FULL" : `💳 ${pmt.paymentCount} payment${pmt.paymentCount !== 1 ? "s" : ""} received`}
                                  </Typography>
                                  {!pmt.isPaid && (
                                    <Typography variant="caption" color="warning.dark">
                                      ${pmt.balance.toFixed(0)} left
                                    </Typography>
                                  )}
                                </Box>
                              ) : inv ? (
                                <Box sx={{ mb: 1, p: 1, bgcolor: "#fff3e0", borderRadius: 1, borderLeft: "3px solid #ff9800" }}>
                                  <Typography variant="caption" color="warning.dark">
                                    ⏳ Invoice sent — awaiting payment
                                  </Typography>
                                </Box>
                              ) : null;

                              if (!hasRevenue) {
                                return (
                                  <>
                                    {paymentChip}
                                    <Box sx={{ mb: 2, p: 1, bgcolor: "#f5f5f5", borderRadius: 1 }}>
                                      <Typography variant="caption" color="text.secondary">
                                        💰 No invoice — profitability unknown
                                      </Typography>
                                    </Box>
                                  </>
                                );
                              }
                              const profit = revenue - materials;
                              const margin = (profit / revenue) * 100;
                              const isLoss = margin < 0;
                              const isThin = margin >= 0 && margin < 20;
                              const bgcolor = isLoss ? "#ffebee" : isThin ? "#fffde7" : "#e8f5e9";
                              const borderColor = isLoss ? "#f44336" : isThin ? "#ff9800" : "#4caf50";
                              const emoji = isLoss ? "🔴" : isThin ? "🟡" : "🟢";
                              return (
                                <>
                                  {paymentChip}
                                  <Box sx={{ mb: 2, p: 1, bgcolor, borderRadius: 1, borderLeft: `3px solid ${borderColor}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <Typography variant="caption" fontWeight="bold">
                                      {emoji} Margin: {margin.toFixed(0)}%
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      ${revenue.toFixed(0)} rev · ${materials.toFixed(0)} mat
                                    </Typography>
                                  </Box>
                                </>
                              );
                            })()}

                            <FormControl fullWidth sx={{ mb: 2 }}>
                              <InputLabel size="small">Job Type</InputLabel>
                              <Select
                                size="small"
                                value={job.jobType || "General Service"}
                                label="Job Type"
                                onChange={(e) => handleJobTypeChange(job.id, e.target.value)}
                              >
                                <MenuItem value="Quick Weed Service">Quick Weed Service</MenuItem>
                                <MenuItem value="Maintenance">Maintenance</MenuItem>
                                <MenuItem value="General Service">General Service</MenuItem>
                              </Select>
                            </FormControl>

                            <FormControl fullWidth sx={{ mb: 2 }}>
                              <InputLabel size="small">Change Status</InputLabel>
                              <Select
                                size="small"
                                value={job.status || "Pending"}
                                label="Change Status"
                                onChange={(e) => handleStatusChange(job.id, e.target.value)}
                              >
                                <MenuItem value="Active">Active</MenuItem>
                                <MenuItem value="Pending">Pending</MenuItem>
                                <MenuItem value="Completed">Completed</MenuItem>
                                <MenuItem value="Cancelled">Cancelled</MenuItem>
                              </Select>
                            </FormControl>

                            <Box sx={{ display: "flex", gap: 1, mb: 1, flexWrap: "wrap" }}>
                              <Chip icon={<PhotoLibraryIcon />} label={`Before: ${(job.beforePhotos || []).length}`} size="small" color="primary" variant="outlined" />
                              <Chip icon={<PhotoLibraryIcon />} label={`After: ${(job.afterPhotos || []).length}`} size="small" color="success" variant="outlined" />
                            </Box>
                          </CardContent>

                          <CardActions sx={{ p: 2, pt: 0, flexDirection: "column", gap: 1 }}>
                            <Button variant="contained" color="primary" startIcon={<EditIcon />} onClick={() => handleOpenEditDialog(job)} fullWidth size="small">
                              Edit Job
                            </Button>
                            <Button variant="outlined" startIcon={<CameraAltIcon />} onClick={() => handleOpenCamera("before", job)} fullWidth size="small">
                              Take Before Photo
                            </Button>
                            <Button variant="outlined" color="success" startIcon={<CameraAltIcon />} onClick={() => handleOpenCamera("after", job)} fullWidth size="small">
                              Take After Photo
                            </Button>
                            <Button variant="contained" color="info" onClick={() => handleViewPhotos(job)} fullWidth size="small">
                              View All Photos ({(job.beforePhotos || []).length + (job.afterPhotos || []).length})
                            </Button>
                            <Button variant="contained" color="primary" onClick={() => navigate(`/job-expenses/${job.id}`)} fullWidth size="small">
                              View Expenses & Profit
                            </Button>

                            {archived ? (
                              <Button
                                variant="contained"
                                color="success"
                                startIcon={<UnarchiveIcon />}
                                onClick={() => handleRestoreJob(job)}
                                fullWidth
                                size="small"
                              >
                                Restore Job
                              </Button>
                            ) : (
                              <Button
                                variant="outlined"
                                color="warning"
                                startIcon={<ArchiveIcon />}
                                onClick={() => handleArchiveJob(job)}
                                fullWidth
                                size="small"
                              >
                                Archive Job
                              </Button>
                            )}

                            <Button variant="outlined" color="error" onClick={() => handleDeleteJob(job.id, job.clientName)} fullWidth size="small">
                              Delete Job
                            </Button>
                          </CardActions>
                        </Card>
                      );
                    })}
                  </Box>
                </AccordionDetails>
              </Accordion>
            );
          });
      })()}

      <Dialog
        open={cameraOpen}
        onClose={handleCloseCamera}
        maxWidth="sm"
        fullWidth
        fullScreen={window.innerWidth < 600}
      >
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="h6">
            {photoType.charAt(0).toUpperCase() + photoType.slice(1)} Photo
          </Typography>
          <IconButton onClick={handleCloseCamera}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent>
          {!capturedImage ? (
            <Box sx={{ textAlign: "center" }}>
              <Box sx={{ display: { xs: "none", sm: "block" } }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    width: "100%",
                    maxHeight: "400px",
                    borderRadius: "8px",
                    backgroundColor: "#000",
                  }}
                />
                <canvas ref={canvasRef} style={{ display: "none" }} />
              </Box>

              <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
                <Button
                  variant="contained"
                  onClick={handleCapturePhoto}
                  fullWidth
                  size="large"
                  sx={{ display: { xs: "none", sm: "flex" } }}
                >
                  Capture Photo
                </Button>

                <Button
                  variant="contained"
                  onClick={() => fileInputRef.current?.click()}
                  fullWidth
                  size="large"
                  sx={{ display: { xs: "flex", sm: "none" } }}
                >
                  Open Camera
                </Button>

                <Button
                  variant="outlined"
                  onClick={() => galleryInputRef.current?.click()}
                  fullWidth
                >
                  Choose from Gallery
                </Button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />
              </Box>
            </Box>
          ) : (
            <Box sx={{ textAlign: "center" }}>
              <img
                src={capturedImage}
                alt="Captured"
                style={{
                  width: "100%",
                  maxHeight: "400px",
                  borderRadius: "8px",
                  objectFit: "contain",
                }}
              />
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2, gap: 1 }}>
          {capturedImage ? (
            <>
              <Button
                onClick={() => setCapturedImage(null)}
                variant="outlined"
              >
                Retake
              </Button>
              <Button
                onClick={handleUploadPhoto}
                disabled={uploading}
                variant="contained"
                color="success"
              >
                {uploading ? "Uploading..." : "Save Photo"}
              </Button>
            </>
          ) : (
            <Button onClick={handleCloseCamera}>
              Cancel
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog
        open={editDialogOpen}
        onClose={handleCloseEditDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edit Job</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
            <TextField
              label="Client Name *"
              value={editForm.clientName}
              onChange={(e) => setEditForm({ ...editForm, clientName: e.target.value })}
              fullWidth
            />

            <TextField
              label="Description"
              multiline
              rows={3}
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              fullWidth
            />

            <TextField
              label="Amount ($)"
              type="number"
              value={editForm.amount}
              onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
              fullWidth
              inputProps={{ min: 0, step: "0.01" }}
            />

            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={editForm.status}
                label="Status"
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
              >
                <MenuItem value="Active">Active</MenuItem>
                <MenuItem value="Pending">Pending</MenuItem>
                <MenuItem value="Completed">Completed</MenuItem>
                <MenuItem value="Cancelled">Cancelled</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Start Date"
              type="date"
              value={editForm.startDate}
              onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />

            <TextField
              label="Completion Date"
              type="date"
              value={editForm.completionDate}
              onChange={(e) => setEditForm({ ...editForm, completionDate: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />

            <TextField
              label="Notes"
              multiline
              rows={3}
              value={editForm.notes}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              fullWidth
            />

            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel>Assigned Employees</InputLabel>
              <Select
                multiple
                value={editForm.assignedEmployees || []}
                onChange={(e) => setEditForm({ ...editForm, assignedEmployees: e.target.value })}
                label="Assigned Employees"
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
                    <Checkbox checked={(editForm.assignedEmployees || []).indexOf(emp.id) > -1} />
                    <ListItemText primary={emp.name || emp.email} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseEditDialog}>Cancel</Button>
          <Button onClick={handleSaveEdit} variant="contained" color="primary">
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}