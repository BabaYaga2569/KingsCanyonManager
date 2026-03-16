import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import {
  Container,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Box,
  Paper,
  IconButton,
  Tooltip,
  Alert,
  Divider,
} from "@mui/material";
import LinkIcon from '@mui/icons-material/Link';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import EmailIcon from '@mui/icons-material/Email';
import Swal from "sweetalert2";
import SignatureCanvas from "react-signature-canvas";
import jsPDF from "jspdf";
import { sendBidEmail } from "./emailService";

export default function BidEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bid, setBid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [customerEmail, setCustomerEmail] = useState("");
  
  // Voice recognition state
  const [listening, setListening] = useState(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef(null);

  // Signature canvases + timestamps
  const clientSigRef = useRef(null);
  const contractorSigRef = useRef(null);
  const [clientSignedAt, setClientSignedAt] = useState("");
  const [contractorSignedAt, setContractorSignedAt] = useState("");
  const [clientSigData, setClientSigData] = useState(null);
  const [contractorSigData, setContractorSigData] = useState(null);

  // Logo for PDF
  const [logoDataUrl, setLogoDataUrl] = useState(null);

  const COMPANY = {
    name: "Kings Canyon Landscaping LLC",
    cityState: "Bullhead City, AZ",
    phone: "(928) 450-5733",
    email: "kingscanyon775@gmail.com",
    logoPath: "/logo-kcl.png",
  };

  // Smart lumber formatting function
  const formatLumber = (text) => {
    // Number words to digits mapping
    const numberWords = {
      'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
      'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10',
      'eleven': '11', 'twelve': '12', 'thirteen': '13', 'fourteen': '14',
      'fifteen': '15', 'sixteen': '16', 'eighteen': '18', 'twenty': '20'
    };

    let formattedText = text;

    // Pattern for lumber dimensions: "X by Y" or "X by Ys"
    // Matches: "two by four", "2 by 4", "two by fours", etc.
    const lumberPattern = /(\w+)\s+by\s+(\w+s?)/gi;

    formattedText = formattedText.replace(lumberPattern, (match, num1, num2) => {
      // Convert word numbers to digits
      const digit1 = numberWords[num1.toLowerCase()] || num1;
      
      // Handle plural (e.g., "fours" -> "four" + "s")
      let digit2 = num2.toLowerCase();
      const isPlural = digit2.endsWith('s');
      if (isPlural) {
        digit2 = digit2.slice(0, -1); // Remove 's'
      }
      digit2 = numberWords[digit2] || digit2;

      // Format as lumber dimension
      const formatted = `${digit1}"x${digit2}"`;
      return isPlural ? `${formatted}s` : formatted;
    });

    // Additional common lumber terms
    const replacements = {
      // Sheet goods
      'four by eight': '4\'x8\'',
      'four by eights': '4\'x8\'s',
      '4 by 8': '4\'x8\'',
      '4 by 8s': '4\'x8\'s',
      
      // Common phrases
      'plywood sheet': 'plywood sheet',
      'drywall sheet': 'drywall sheet',
      'sheet of plywood': 'sheet of plywood',
      'sheet of drywall': 'sheet of drywall',
      
      // Hardware
      'three inch': '3"',
      'three-inch': '3"',
      'four inch': '4"',
      'four-inch': '4"',
      'gallon': 'gal',
      'gallons': 'gal',
    };

    // Apply additional replacements
    Object.keys(replacements).forEach(key => {
      const regex = new RegExp(key, 'gi');
      formattedText = formattedText.replace(regex, replacements[key]);
    });

    return formattedText;
  };

  // ✅ HOOK 1: Initialize speech recognition
  useEffect(() => {
    // Check if Web Speech API is supported
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setSpeechSupported(true);
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // ✅ HOOK 2: Fetch bid data
  useEffect(() => {
    const fetchBid = async () => {
      try {
        const docRef = doc(db, "bids", id);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          setBid({ id: snap.id, ...data });
          // Load saved signatures if they exist
          if (data.clientSignature) {
            setClientSigData(data.clientSignature);
          }
          if (data.contractorSignature) {
            setContractorSigData(data.contractorSignature);
          }
          if (data.clientSignedAt) {
            setClientSignedAt(data.clientSignedAt);
          }
          if (data.contractorSignedAt) {
            setContractorSignedAt(data.contractorSignedAt);
          }
        } else {
          Swal.fire("Not found", "Bid not found.", "error");
          navigate("/bids");
        }
      } catch (e) {
        console.error("Error loading bid:", e);
        Swal.fire("Error", "Failed to load bid.", "error");
        navigate("/bids");
      } finally {
        setLoading(false);
      }
    };
    fetchBid();
  }, [id, navigate]);

  // ✅ HOOK 3: Load client signature when data changes
  useEffect(() => {
    if (clientSigData && clientSigRef.current) {
      clientSigRef.current.fromDataURL(clientSigData);
    }
  }, [clientSigData]);

  // ✅ HOOK 4: Load contractor signature when data changes
  useEffect(() => {
    if (contractorSigData && contractorSigRef.current) {
      contractorSigRef.current.fromDataURL(contractorSigData);
    }
  }, [contractorSigData]);

  // ✅ HOOK 5: Preload logo for PDF
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        setLogoDataUrl(c.toDataURL("image/png"));
      } catch (e) {
        console.error("Logo loading error:", e);
      }
    };
    img.onerror = () => setLogoDataUrl(null);
    img.src = COMPANY.logoPath;
  }, []);

  // ✅ HOOK 6: Look up customer email
  useEffect(() => {
    const findCustomerEmail = async () => {
      if (!bid) return;
      
      if (bid.customerEmail) {
        setCustomerEmail(bid.customerEmail);
        return;
      }
      
      try {
        if (bid.customerId) {
          const customerDoc = await getDoc(doc(db, "customers", bid.customerId));
          if (customerDoc.exists() && customerDoc.data().email) {
            setCustomerEmail(customerDoc.data().email);
            return;
          }
        }
        
        if (bid.customerName) {
          const q = query(collection(db, "customers"), where("name", "==", bid.customerName));
          const snap = await getDocs(q);
          if (!snap.empty && snap.docs[0].data().email) {
            setCustomerEmail(snap.docs[0].data().email);
          }
        }
      } catch (err) {
        console.error("Error looking up customer email:", err);
      }
    };
    
    findCustomerEmail();
  }, [bid?.customerId, bid?.customerName]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setBid({ ...bid, [name]: value });
  };

  const startListening = (fieldName) => {
    if (!recognitionRef.current || !speechSupported) {
      Swal.fire({
        icon: 'info',
        title: 'Voice Input Not Supported',
        text: 'Please use your phone\'s keyboard microphone button instead.',
        timer: 3000,
      });
      return;
    }

    setListening(fieldName);
    let finalTranscript = bid[fieldName] || '';

    recognitionRef.current.onresult = (event) => {
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          // Apply smart formatting to final transcript
          const formattedTranscript = formatLumber(transcript);
          finalTranscript += formattedTranscript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      // Update the field with formatted transcript
      setBid({ ...bid, [fieldName]: finalTranscript + interimTranscript });
    };

    recognitionRef.current.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setListening(null);
      
      if (event.error === 'not-allowed') {
        Swal.fire({
          icon: 'warning',
          title: 'Microphone Access Denied',
          text: 'Please allow microphone access in your browser settings.',
        });
      }
    };

    recognitionRef.current.onend = () => {
      setListening(null);
    };

    recognitionRef.current.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setListening(null);
  };

  // Signature handling functions
  const clearClientSig = () => {
    clientSigRef.current?.clear();
    setClientSignedAt("");
    setClientSigData(null);
  };

  const clearContractorSig = () => {
    contractorSigRef.current?.clear();
    setContractorSignedAt("");
    setContractorSigData(null);
  };

  const markClientSigned = () => {
    const timestamp = new Date().toLocaleString();
    const sigData = clientSigRef.current?.toDataURL();
    setClientSignedAt(timestamp);
    setClientSigData(sigData);
  };

  const markContractorSigned = () => {
    const timestamp = new Date().toLocaleString();
    const sigData = contractorSigRef.current?.toDataURL();
    setContractorSignedAt(timestamp);
    setContractorSigData(sigData);
  };

  // Auto-sign for Darren (one-click)
  const autoSignForDarren = () => {
    const timestamp = new Date().toLocaleString();
    const darrenSig = generateDarrenAutoSignature();
    setContractorSignedAt(timestamp);
    setContractorSigData(darrenSig);
    
    // Show success message
    Swal.fire({
      icon: "success",
      title: "Auto-Signed!",
      text: "Darren's signature has been applied.",
      timer: 1500,
      showConfirmButton: false,
    });
  };

  // Generate Darren's auto-signature
  const generateDarrenAutoSignature = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    
    // White background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 400, 100);
    
    // Signature text in cursive style
    ctx.font = '32px "Brush Script MT", cursive';
    ctx.fillStyle = 'black';
    ctx.fillText('Darren Bennett', 50, 60);
    
    return canvas.toDataURL('image/png');
  };

  const handleSave = async () => {
    if (!bid.customerName || !bid.amount) {
      Swal.fire("Missing info", "Customer name and amount are required.", "warning");
      return;
    }

    if (!bid.description || !bid.description.trim()) {
      Swal.fire({
        icon: "warning",
        title: "Description Required",
        html: `Please describe the work to be done.<br/><br/>
               <small>This appears on the bid document and helps your crew know what the job is.</small>`,
        confirmButtonText: "OK",
      });
      return;
    }

    setSaving(true);
    try {
      const docRef = doc(db, "bids", id);
      await updateDoc(docRef, {
        customerName: bid.customerName,
        amount: parseFloat(bid.amount),
        description: bid.description || "",
        materials: bid.materials || "",
        notes: bid.notes || "",
        clientSignature: clientSigData,
        contractorSignature: contractorSigData,
        clientSignedAt,
        contractorSignedAt,
        updatedAt: new Date().toISOString(),
      });
      
      await Swal.fire("Saved", "Bid updated successfully.", "success");
      navigate("/bids");
    } catch (e) {
      console.error("Error saving bid:", e);
      Swal.fire("Error", "Failed to save changes.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSendForSignature = () => {
    const signingLink = `${window.location.origin}/public/sign-bid/${id}?token=${bid.signingToken}`;
    
    navigator.clipboard.writeText(signingLink).then(() => {
      Swal.fire({
        icon: 'success',
        title: 'Link Copied!',
        html: `
          <p>Signing link copied to clipboard:</p>
          <div style="background: #f5f5f5; padding: 10px; border-radius: 4px; word-break: break-all; margin: 10px 0;">
            ${signingLink}
          </div>
          <p><strong>Next steps:</strong></p>
          <ul style="text-align: left;">
            <li>Send this link to your customer via email or text</li>
            <li>They can sign on any device (phone, tablet, computer)</li>
            <li>You'll be notified when they accept</li>
          </ul>
        `,
        confirmButtonText: 'OK'
      });
    }).catch((err) => {
      console.error('Failed to copy:', err);
      Swal.fire({
        icon: 'info',
        title: 'Signing Link',
        html: `
          <p>Send this link to your customer:</p>
          <div style="background: #f5f5f5; padding: 10px; border-radius: 4px; word-break: break-all; margin: 10px 0;">
            ${signingLink}
          </div>
        `,
      });
    });
  };

  // helper for PDF text wrapping
  const writeParagraph = (pdfDoc, text, x, yStart, maxWidth) => {
    const lines = pdfDoc.splitTextToSize(text, maxWidth);
    pdfDoc.text(lines, x, yStart);
    return yStart + lines.length * 12;
  };

  // Build Bid PDF and return jsPDF object
  const buildBidPDF = () => {
    if (!bid) return null;

    const docPDF = new jsPDF({ unit: "pt", format: "letter" });
    const W = docPDF.internal.pageSize.getWidth();
    const H = docPDF.internal.pageSize.getHeight();

    // Frame
    docPDF.setDrawColor(60);
    docPDF.setLineWidth(1);
    docPDF.rect(28, 28, W - 56, H - 56);

    // Logo
    if (logoDataUrl) {
      try {
        docPDF.addImage(logoDataUrl, "PNG", 40, 42, 60, 60);
      } catch (e) {
        console.error("Error adding logo:", e);
      }
    }

    // Company info
    docPDF.setFont("helvetica", "bold");
    docPDF.setFontSize(14);
    docPDF.text(COMPANY.name, 110, 50);
    docPDF.setFont("helvetica", "normal");
    docPDF.setFontSize(10);
    docPDF.text(COMPANY.cityState, 110, 66);
    docPDF.text(COMPANY.phone, 110, 80);
    docPDF.text(COMPANY.email, 110, 94);

    // Title
    docPDF.setFont("helvetica", "bold");
    docPDF.setFontSize(14);
    docPDF.text("Estimate / Bid", W - 40, 50, { align: "right" });

    // Meta
    docPDF.setFont("helvetica", "normal");
    docPDF.setFontSize(10);
    docPDF.text(`Bid No.: ${id.slice(-8)}`, W - 40, 70, { align: "right" });
    docPDF.text(`Date: ${new Date().toLocaleDateString()}`, W - 40, 84, { align: "right" });

    // Divider
    docPDF.setDrawColor(150);
    docPDF.line(40, 110, W - 40, 110);

    let y = 130;

    const writeLabelValue = (label, value) => {
      docPDF.setFont("helvetica", "bold");
      docPDF.text(`${label}:`, 40, y);
      docPDF.setFont("helvetica", "normal");
      docPDF.text(`${value || "N/A"}`, 140, y, { maxWidth: W - 180 });
      y += 18;
    };

    writeLabelValue("Customer", bid.customerName);
    writeLabelValue("Amount", bid.amount ? `$${parseFloat(bid.amount).toFixed(2)}` : "N/A");

    // Description
    y += 10;
    docPDF.setFont("helvetica", "bold");
    docPDF.setFontSize(11);
    docPDF.text("Description of Work", 40, y);
    y += 14;
    docPDF.setFont("helvetica", "normal");
    docPDF.setFontSize(10);
    const desc = docPDF.splitTextToSize(bid.description || "N/A", W - 80);
    docPDF.text(desc, 40, y);
    y += desc.length * 12 + 16;

    // Materials
    if (bid.materials) {
      docPDF.setFont("helvetica", "bold");
      docPDF.setFontSize(11);
      docPDF.text("Materials", 40, y);
      y += 14;
      docPDF.setFont("helvetica", "normal");
      docPDF.setFontSize(10);
      const mats = docPDF.splitTextToSize(bid.materials, W - 80);
      docPDF.text(mats, 40, y);
      y += mats.length * 12 + 16;
    }

    // Terms
    y += 10;
    docPDF.setFont("helvetica", "bold");
    docPDF.setFontSize(11);
    docPDF.text("Terms & Conditions", 40, y);
    y += 14;
    docPDF.setFont("helvetica", "normal");
    docPDF.setFontSize(10);
    y = writeParagraph(
      docPDF,
      "This estimate is valid for 30 days from the date above. Prices may vary if scope changes. Payment terms: due upon completion unless otherwise agreed. A deposit may be required for material purchases.",
      40, y, W - 80
    );
    y += 20;

    // Signatures
    if (clientSigData || contractorSigData) {
      docPDF.setFont("helvetica", "bold");
      docPDF.setFontSize(11);
      docPDF.text("Signatures", 40, y);
      y += 16;

      const sigBoxH = 70;
      const col1X = 40;
      const col2X = W / 2 + 10;
      const boxW = W / 2 - 50;

      docPDF.setDrawColor(120);
      docPDF.rect(col1X, y, boxW, sigBoxH);
      docPDF.rect(col2X, y, boxW, sigBoxH);

      if (clientSigData) {
        try {
          docPDF.addImage(clientSigData, "PNG", col1X + 4, y + 4, boxW - 8, sigBoxH - 8);
        } catch (e) {}
      }
      if (contractorSigData) {
        try {
          docPDF.addImage(contractorSigData, "PNG", col2X + 4, y + 4, boxW - 8, sigBoxH - 8);
        } catch (e) {}
      }

      y += sigBoxH + 14;
      docPDF.setFont("helvetica", "bold");
      docPDF.setFontSize(9);
      docPDF.text("Client Signature", col1X, y);
      docPDF.text("Contractor Signature", col2X, y);
      y += 12;
      docPDF.setFont("helvetica", "normal");
      docPDF.text(clientSignedAt ? `Signed: ${clientSignedAt}` : "Not signed", col1X, y);
      docPDF.text(contractorSignedAt ? `Signed: ${contractorSignedAt}` : "Not signed", col2X, y);
    }

    // Footer
    docPDF.setFontSize(9);
    docPDF.setTextColor(100);
    docPDF.text(
      "Thank you for considering Kings Canyon Landscaping. We appreciate your business.",
      W / 2, H - 36, { align: "center" }
    );

    return docPDF;
  };

  // Download PDF
  const handleGeneratePDF = () => {
    try {
      const docPDF = buildBidPDF();
      if (!docPDF) return;

      const filenameSafe = (bid.customerName || "Bid").replace(/[^\w\- ]+/g, "_").replace(/\s+/g, "_");
      const filename = `${filenameSafe}_Estimate_${id.slice(-8)}.pdf`;
      docPDF.save(filename);

      Swal.fire({
        icon: "success",
        title: "PDF Downloaded!",
        text: `Estimate saved as ${filename}`,
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      Swal.fire("Error", "Failed to generate PDF.", "error");
    }
  };

  // ✅ EMAIL BID TO CUSTOMER
  const handleEmailToCustomer = async () => {
    let emailToSend = customerEmail;
    
    if (!emailToSend) {
      const { value: enteredEmail } = await Swal.fire({
        title: 'Customer Email',
        input: 'email',
        inputLabel: `Enter email for ${bid.customerName}`,
        inputPlaceholder: 'customer@email.com',
        showCancelButton: true,
        confirmButtonText: 'Send',
        validationMessage: 'Please enter a valid email address',
      });
      
      if (!enteredEmail) return;
      emailToSend = enteredEmail;
      setCustomerEmail(enteredEmail);
      
      try {
        await updateDoc(doc(db, "bids", id), { customerEmail: enteredEmail });
      } catch (e) {
        console.error("Error saving customer email:", e);
      }
    }
    
    const confirm = await Swal.fire({
      title: 'Email Estimate',
      html: `Send estimate PDF to:<br/><strong>${bid.customerName}</strong><br/>${emailToSend}`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Send Email',
      confirmButtonColor: '#1565c0',
    });
    
    if (!confirm.isConfirmed) return;
    
    setSending(true);
    try {
      const docPDF = buildBidPDF();
      if (!docPDF) throw new Error("Failed to generate PDF");
      
      const pdfBase64 = docPDF.output('datauristring').split(',')[1];
      
      await sendBidEmail(
        emailToSend,
        bid.customerName,
        { ...bid, id },
        pdfBase64
      );
      
      // Update bid status
      await updateDoc(doc(db, "bids", id), {
        status: "Sent",
        emailSentAt: new Date().toISOString(),
        emailSentTo: emailToSend,
      });
      setBid({ ...bid, status: "Sent" });
      
      Swal.fire({
        icon: 'success',
        title: 'Email Sent!',
        html: `Estimate sent to <strong>${emailToSend}</strong>`,
        timer: 3000,
        showConfirmButton: false,
      });
      
    } catch (error) {
      console.error("Error sending email:", error);
      Swal.fire({
        icon: 'error',
        title: 'Email Failed',
        text: error.message || 'Could not send email. Check Gmail settings.',
      });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <Container sx={{ mt: 4, textAlign: "center" }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading bid...
        </Typography>
      </Container>
    );
  }

  if (!bid) {
    return (
      <Container sx={{ mt: 4 }}>
        <Typography variant="h6">No bid data available.</Typography>
      </Container>
    );
  }

  // Render text field with optional voice button
  const renderField = (name, label, multiline = false, rows = 1, helperText = "") => (
    <Box sx={{ position: 'relative' }}>
      <TextField
        label={label}
        name={name}
        value={bid[name] || ""}
        onChange={handleChange}
        fullWidth
        multiline={multiline}
        rows={multiline ? rows : 1}
        helperText={helperText}
        required={name === 'customerName' || name === 'amount'}
        type={name === 'amount' ? 'number' : 'text'}
        inputProps={
          name === 'amount'
            ? { min: 0, step: "0.01" }
            : {
                autoCapitalize: 'sentences',
                autoCorrect: 'on',
                spellCheck: 'true',
                autoComplete: name === 'customerName' ? 'name' : 'on',
              }
        }
        InputProps={{
          endAdornment: speechSupported && name !== 'amount' && (
            <Tooltip title={listening === name ? "Stop Recording" : "Start Voice Input"}>
              <IconButton
                onClick={() => listening === name ? stopListening() : startListening(name)}
                edge="end"
                color={listening === name ? "error" : "primary"}
                sx={{ mr: -1 }}
              >
                {listening === name ? <MicOffIcon /> : <MicIcon />}
              </IconButton>
            </Tooltip>
          ),
        }}
      />
    </Box>
  );

  return (
    <Container sx={{ mt: { xs: 2, sm: 4 }, pb: { xs: 4, sm: 8 }, px: { xs: 2, sm: 3 } }}>
      <Paper 
        elevation={2}
        sx={{ 
          p: { xs: 2, sm: 3 },
          borderRadius: 2
        }}
      >
        <Typography 
          variant="h5" 
          gutterBottom
          sx={{ 
            fontSize: { xs: '1.5rem', sm: '2rem' },
            mb: 3
          }}
        >
          Edit Bid — {bid.customerName}
        </Typography>

        {speechSupported && (
          <Box 
            sx={{ 
              mb: 2, 
              p: 1.5, 
              backgroundColor: '#e3f2fd', 
              borderRadius: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}
          >
            <MicIcon color="primary" />
            <Typography variant="body2" color="primary">
              🪵 Click the microphone icon next to any field to use voice input with smart lumber formatting!
            </Typography>
          </Box>
        )}

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {renderField('customerName', 'Customer Name', false, 1)}
          {renderField('amount', 'Amount ($)', false, 1)}
          {renderField('description', 'Description', true, 4, 'Describe the work to be done')}
          {renderField('materials', 'Materials', true, 3, 'List materials needed for the job')}
          {renderField('notes', 'Notes', true, 2, 'Internal notes (not shown to customer)')}

          {/* Signature Pads - Added to match Contract Editor */}
          <Box sx={{ mt: 3 }}>
            <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
              Signatures
            </Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  Client Signature
                </Typography>
                <SignatureCanvas
                  ref={clientSigRef}
                  canvasProps={{
                    width: 400,
                    height: 180,
                    style: { border: "1px solid #ccc", borderRadius: 8, width: "100%" },
                  }}
                />
                <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                  <Button size="small" variant="outlined" onClick={markClientSigned}>
                    Save Timestamp
                  </Button>
                  <Button size="small" variant="text" onClick={clearClientSig}>
                    Clear
                  </Button>
                </Box>
                <Typography variant="caption" sx={{ mt: 1, display: "block" }}>
                  {clientSignedAt ? `Signed: ${clientSignedAt}` : "Not yet signed"}
                </Typography>
              </Paper>

              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  Contractor Signature (Kings Canyon Landscaping)
                </Typography>
                <SignatureCanvas
                  ref={contractorSigRef}
                  canvasProps={{
                    width: 400,
                    height: 180,
                    style: { border: "1px solid #ccc", borderRadius: 8, width: "100%" },
                  }}
                />
                <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
                  <Button 
                    size="small" 
                    variant="contained" 
                    color="success"
                    onClick={autoSignForDarren}
                    sx={{ flexGrow: 1 }}
                  >
                    ✍️ Auto-Sign for Darren
                  </Button>
                  <Button size="small" variant="outlined" onClick={markContractorSigned}>
                    Save Manual Signature
                  </Button>
                  <Button size="small" variant="text" onClick={clearContractorSig}>
                    Clear
                  </Button>
                </Box>
                <Typography variant="caption" sx={{ mt: 1, display: "block" }}>
                  {contractorSignedAt ? `Signed: ${contractorSignedAt}` : "Not yet signed"}
                </Typography>
              </Paper>
            </Box>
          </Box>

          {bid.createdAt && (
            <Typography variant="caption" color="text.secondary">
              Created: {new Date(bid.createdAt).toLocaleString()}
            </Typography>
          )}

          {/* Signature Status */}
          {bid.clientSignature && bid.clientSignedAt && (
            <Alert severity="success" icon={<CheckCircleIcon />} sx={{ mb: 2 }}>
              <Typography variant="body2">
                <strong>✅ Bid Accepted!</strong><br />
                Signed by {bid.customerName} on {new Date(bid.clientSignedAt).toLocaleString()}
              </Typography>
            </Alert>
          )}

          {/* Customer Email Info */}
          {customerEmail && (
            <Alert severity="info">
              Customer email on file: <strong>{customerEmail}</strong>
            </Alert>
          )}

          {/* Email sent status */}
          {bid.emailSentAt && (
            <Alert severity="success" icon={<EmailIcon />}>
              Estimate emailed to <strong>{bid.emailSentTo}</strong> on {new Date(bid.emailSentAt).toLocaleString()}
            </Alert>
          )}

          <Divider sx={{ my: 2 }} />

          <Box sx={{ display: "flex", gap: 2, mt: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
            <Button 
              variant="contained" 
              onClick={handleSave} 
              disabled={saving}
              size="large"
              sx={{ minWidth: 120 }}
              fullWidth
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
            <Button 
              variant="contained"
              color="success"
              onClick={handleEmailToCustomer}
              disabled={sending}
              size="large"
              startIcon={<EmailIcon />}
              fullWidth
            >
              {sending ? "Sending..." : "Email to Customer"}
            </Button>
            <Button 
              variant="outlined"
              color="primary"
              onClick={handleGeneratePDF}
              size="large"
              fullWidth
            >
              Download PDF
            </Button>
            <Button 
              variant="outlined" 
              color="inherit" 
              onClick={() => navigate("/bids")}
              size="large"
              fullWidth
            >
              Cancel
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Voice Dictation Tips with Smart Formatting */}
      {speechSupported && (
        <Paper 
          elevation={1}
          sx={{ 
            mt: 3,
            p: 2,
            backgroundColor: '#f5f5f5'
          }}
        >
          <Typography variant="subtitle1" gutterBottom fontWeight="bold">
            🎤 Voice Input Tips:
          </Typography>
          <Typography variant="body2" component="div" sx={{ mb: 2 }}>
            • Click the microphone icon to start speaking<br/>
            • Say "period", "comma", "question mark" for punctuation<br/>
            • Say "new line" for line breaks<br/>
            • Speak clearly and pause between sentences<br/>
            • Click the red microphone to stop recording
          </Typography>

          <Typography variant="subtitle1" gutterBottom fontWeight="bold" sx={{ mt: 2 }}>
            🪵 Smart Lumber Formatting:
          </Typography>
          <Typography variant="body2" component="div">
            Say lumber dimensions naturally - they'll auto-format!<br/>
            <br/>
            <strong>Examples:</strong><br/>
            • "forty two two by fours" → <strong>42 2"x4"s</strong><br/>
            • "eight two by sixes" → <strong>8 2"x6"s</strong><br/>
            • "ten four by fours" → <strong>10 4"x4"s</strong><br/>
            • "three sheets of four by eight plywood" → <strong>3 sheets of 4'x8' plywood</strong><br/>
            • "five gallons of primer" → <strong>5 gal of primer</strong><br/>
            <br/>
            <strong>Supported sizes:</strong><br/>
            1x6, 2x4, 2x6, 2x8, 2x10, 2x12, 4x4, 4x6, 4x8 sheets, and more!
          </Typography>
        </Paper>
      )}
    </Container>
  );
}