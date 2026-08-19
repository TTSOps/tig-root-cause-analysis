// ==========================================================================
// TIG Root Cause Analysis (RCA) Tool - Application Logic
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  // --- State Variables ---
  let rcaRecords = [];
  let currentRecord = null;
  let activeStep = 1;
  let summaryChart = null;
  let severityChart = null;
  let maximizedChart = null;
  let lastLocationList = [];
  let lastCraftList = [];
  let lastSupervisorList = [];

  // Helper to normalize and convert dates to YYYY-MM-DD
  function normalizeDate(dateVal) {
    if (!dateVal) return '';
    
    // If it's a Date object
    if (dateVal instanceof Date) {
      if (isNaN(dateVal.getTime())) return '';
      return dateVal.toISOString().split('T')[0];
    }

    // If it's a number (Excel serial date number)
    if (typeof dateVal === 'number' || !isNaN(Number(dateVal))) {
      const num = Number(dateVal);
      if (num > 0) {
        // Excel base date is Dec 30 1899 due to leap year bug in Excel
        const date = new Date(Math.round((num - 25569) * 86400 * 1000));
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      }
    }

    // If it's a string
    const str = String(dateVal).trim();
    if (!str) return '';

    // e.g. "02-18-2008" or "07-14-2026"
    let match = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
    if (match) {
      const month = match[1].padStart(2, '0');
      const day = match[2].padStart(2, '0');
      const year = match[3];
      return `${year}-${month}-${day}`;
    }

    // e.g. "2026-07-14"
    match = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (match) {
      const year = match[1];
      const month = match[2].padStart(2, '0');
      const day = match[3].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }

    return '';
  }

  // Nine Standard Root Causes
  const ROOT_CAUSES = [
    "Inadequate Preparation and Planning",
    "Equipment or Resource Failure",
    "Fatigue",
    "Procedural Non-Compliance",
    "Pressure and Shortcuts",
    "Knowledge Gaps",
    "Environmental Interference",
    "Complacency",
    "Deliberate Violation"
  ];

  // --- Seed data removed; records come from Firestore ---

  // --- Initial Setup and Event Handlers ---
  function initApp() {
    // Subscribe to real-time Firestore updates
    if (window.subscribeToRecords) {
      window.subscribeToRecords((records) => {
        rcaRecords = records;
        renderRegistry();
        renderParetoSummaryChart();
        renderSeverityDistributionChart();
      });
    }

    // Populate assigned-to dropdown
    if (window.getUsersList) {
      window.getUsersList().then(users => {
        const sel = document.getElementById('f-assigned-to');
        if (sel) {
          sel.innerHTML = '<option value="">— Unassigned —</option>';
          users.forEach(u => {
            sel.innerHTML += `<option value="${u.email}">${u.displayName || u.email}</option>`;
          });
        }
      });
    }

    // Show/hide admin-only elements
    const userMgmtBtn = document.getElementById('btn-user-management');
    if (userMgmtBtn) {
      userMgmtBtn.style.display = window.isAdmin && window.isAdmin() ? '' : 'none';
      userMgmtBtn.addEventListener('click', openUserManagement);
    }
    const closeUserMgmt = document.getElementById('btn-close-user-mgmt');
    if (closeUserMgmt) {
      closeUserMgmt.addEventListener('click', () => document.getElementById('user-mgmt-overlay').classList.add('hidden'));
    }
    const addUserBtn = document.getElementById('btn-add-user');
    if (addUserBtn) {
      addUserBtn.addEventListener('click', handleAddUser);
    }

    // Hide write actions for viewers
    if (window.isViewer && window.isViewer()) {
      ['btn-new-rca', 'btn-import-excel-trigger', 'btn-bulk-analyze'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
    }

    // Display user name in header
    const nameEl = document.getElementById('user-display-name');
    if (nameEl && window.currentUserProfile) {
      nameEl.textContent = window.currentUserProfile.displayName || window.currentUserProfile.email;
    }

    renderRegistry();
    renderParetoSummaryChart();
    renderSeverityDistributionChart();
    
    // Attach Event Listeners
    document.getElementById('btn-dashboard-view').addEventListener('click', () => switchTab('dashboard'));
    document.getElementById('btn-predictive-view').addEventListener('click', () => switchTab('predictive-risk'));
    document.getElementById('btn-new-rca').addEventListener('click', createNewRca);
    document.getElementById('btn-import-excel-trigger').addEventListener('click', () => document.getElementById('input-excel-file').click());
    document.getElementById('input-excel-file').addEventListener('change', handleExcelImport);
    document.getElementById('btn-bulk-analyze').addEventListener('click', startBulkAnalysis);
    document.getElementById('btn-cancel-bulk').addEventListener('click', cancelBulkAnalysis);
    document.getElementById('btn-wizard-prev').addEventListener('click', prevStep);
    document.getElementById('btn-wizard-next').addEventListener('click', nextStep);
    document.getElementById('btn-wizard-save').addEventListener('click', saveDraftRca);
    document.getElementById('btn-wizard-finalize').addEventListener('click', finalizeRca);
    document.getElementById('btn-wizard-cancel').addEventListener('click', () => {
      if (confirm("Discard draft changes and return to dashboard?")) {
        switchTab('dashboard');
      }
    });
    
    document.getElementById('btn-report-back-wizard').addEventListener('click', () => switchTab('wizard'));
    document.getElementById('btn-report-back-dash').addEventListener('click', () => switchTab('dashboard'));
    document.getElementById('btn-report-print').addEventListener('click', () => {
      document.body.classList.add('printing');
      setTimeout(() => {
        window.print();
        document.body.classList.remove('printing');
      }, 100);
    });
    
    const printRiskBtn = document.getElementById('btn-print-risk-summary');
    if (printRiskBtn) {
      printRiskBtn.addEventListener('click', printRiskExecutiveSummary);
    }

    const maxBtn = document.getElementById('btn-maximize-pareto');
    if (maxBtn) {
      maxBtn.addEventListener('click', () => {
        document.getElementById('chart-modal-overlay').classList.remove('hidden');
        renderMaximizedParetoChart();
      });
    }
    const closeChartBtn = document.getElementById('btn-close-chart-modal');
    if (closeChartBtn) {
      closeChartBtn.addEventListener('click', () => {
        document.getElementById('chart-modal-overlay').classList.add('hidden');
      });
    }
    
    document.getElementById('btn-add-action').addEventListener('click', () => addCorrectiveActionRow('', '', '', ''));
    document.getElementById('btn-ai-generate').addEventListener('click', generateRcaWithAI);

    // Accordion setup
    document.querySelectorAll('.accordion-toggle').forEach(toggle => {
      toggle.addEventListener('click', () => {
        const section = toggle.closest('.accordion-section');
        section.classList.toggle('expanded');
      });
    });

    // Pareto sliders setup
    document.querySelectorAll('.pareto-slider').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const id = e.target.id;
        const val = e.target.value;
        const key = id.replace('sl-pareto-', '');
        document.getElementById(`v-pareto-${key}`).innerText = `${val}%`;
        validateParetoSum();
      });
    });

    // Handle SVG Icons
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // --- Storage & Loading ---
  // --- Storage functions replaced by Firestore (see firestore-service.js) ---
  // loadRecordsFromStorage and saveRecordsToStorage are no longer used.
  // Data is loaded via real-time subscription in initApp().
  // Individual saves go through saveRecordToFirestore().

  async function saveRecordAndSync(record) {
    try {
      if (window.saveRecordToFirestore) {
        await window.saveRecordToFirestore(record);
      }
    } catch (e) {
      console.error('Failed to save record to Firestore:', e);
      showToast('Error saving to database: ' + e.message, 'error');
    }
  }

  // --- UI Tab Navigation ---
  function switchTab(tabId) {
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
    
    const activeTab = document.getElementById(`tab-${tabId}`);
    activeTab.classList.remove('hidden');
    activeTab.classList.add('active');

    // Update active state in header
    const dashBtn = document.getElementById('btn-dashboard-view');
    const predBtn = document.getElementById('btn-predictive-view');
    
    dashBtn.classList.remove('active-tab-btn');
    if (predBtn) predBtn.classList.remove('active-tab-btn');

    if (tabId === 'dashboard') {
      dashBtn.classList.add('active-tab-btn');
      renderRegistry();
      renderParetoSummaryChart();
      renderSeverityDistributionChart();
    } else if (tabId === 'predictive-risk') {
      if (predBtn) predBtn.classList.add('active-tab-btn');
      renderPredictiveRiskDashboard();
    }

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // --- Dashboard Logic ---
  function renderRegistry() {
    rcaRecords.sort((a, b) => {
      const dateA = a.date ? new Date(a.date) : new Date(0);
      const dateB = b.date ? new Date(b.date) : new Date(0);
      return dateB - dateA;
    });

    const tbody = document.getElementById('rca-registry-body');
    tbody.innerHTML = '';

    // Update counters
    document.getElementById('stat-total-rca').innerText = rcaRecords.length;
    document.getElementById('stat-completed-rca').innerText = rcaRecords.filter(r => r.status === 'Completed').length;
    document.getElementById('stat-pending-rca').innerText = rcaRecords.filter(r => r.status === 'Pending Analysis').length;
    
    let totalActions = 0;
    rcaRecords.forEach(r => {
      if (r.correctiveActions) {
        totalActions += r.correctiveActions.length;
      }
    });
    document.getElementById('stat-open-actions').innerText = totalActions;

    if (rcaRecords.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No incident investigations registered. Click "New Analysis" or "Import Incident" to begin.</td></tr>`;
      return;
    }

    rcaRecords.forEach(record => {
      const tr = document.createElement('tr');
      
      const statusClass = record.status === 'Completed' ? 'completed' : 'pending';
      const causeText = record.primaryCause ? record.primaryCause : 'Not analyzed';
      
      tr.innerHTML = `
        <td><strong>${record.igzId || record.id}</strong></td>
        <td>${record.employeeName || 'Unknown Employee'}</td>
        <td>${record.date || 'N/A'}</td>
        <td>${record.incidentDesignation || 'First Aid'}</td>
        <td>${causeText}</td>
        <td><span class="status-badge ${statusClass}">${record.status}</span></td>
        <td style="text-align: center;">
          <div style="display: flex; gap: 6px; justify-content: center;">
            <button class="btn-action-icon btn-edit" title="Edit Investigation" data-id="${record.id}">
              <i data-lucide="edit-3"></i>
            </button>
            <button class="btn-action-icon btn-view-rep" title="View Report" data-id="${record.id}" ${record.status !== 'Completed' ? 'disabled' : ''}>
              <i data-lucide="file-text"></i>
            </button>
            <button class="btn-action-icon text-danger btn-delete" title="Delete" data-id="${record.id}">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </td>
      `;

      tbody.appendChild(tr);
    });

    // Attach row events
    tbody.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = btn.getAttribute('data-id');
        loadRcaIntoWizard(id);
      });
    });

    tbody.querySelectorAll('.btn-view-rep').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = btn.getAttribute('data-id');
        loadRcaIntoReport(id);
      });
    });

    tbody.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = btn.getAttribute('data-id');
        if (confirm("Are you sure you want to permanently delete this investigation record?")) {
          deleteRcaRecord(id);
        }
      });
    });

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function renderParetoSummaryChart() {
    const canvas = document.getElementById('pareto-summary-chart');
    if (!canvas) return;

    // Aggregate primary root cause frequencies
    const freq = {};
    ROOT_CAUSES.forEach(c => freq[c] = 0);
    
    rcaRecords.forEach(r => {
      if (r.status === 'Completed' && r.primaryCause) {
        freq[r.primaryCause] = (freq[r.primaryCause] || 0) + 1;
      }
    });

    // Sort causes by frequency
    const sortedCauses = Object.keys(freq)
      .map(c => ({ cause: c, count: freq[c] }))
      .sort((a, b) => b.count - a.count);

    const labels = sortedCauses.map(s => s.cause.split(' ').slice(0, 3).join(' ') + '...'); // Truncate long strings for chart
    const counts = sortedCauses.map(s => s.count);

    // Calculate cumulative percentages
    const total = counts.reduce((a, b) => a + b, 0);
    let cumulative = 0;
    const cumulativePercent = counts.map(c => {
      if (total === 0) return 0;
      cumulative += c;
      return parseFloat(((cumulative / total) * 100).toFixed(1));
    });

    if (summaryChart) {
      summaryChart.destroy();
    }

    summaryChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Incident Count',
            data: counts,
            backgroundColor: '#0ea5e9',
            borderColor: '#0284c7',
            borderWidth: 1.5,
            yAxisID: 'y'
          },
          {
            label: 'Cumulative %',
            data: cumulativePercent,
            type: 'line',
            borderColor: '#f97316',
            backgroundColor: 'rgba(249, 115, 22, 0.1)',
            borderWidth: 2,
            pointBackgroundColor: '#f97316',
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: '#94a3b8',
              font: { family: 'Jost', size: 10 }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(148, 163, 184, 0.05)' },
            ticks: { color: '#94a3b8', font: { family: 'Jost', size: 9 } }
          },
          y: {
            grid: { color: 'rgba(148, 163, 184, 0.05)' },
            ticks: { color: '#94a3b8', stepSize: 1, font: { family: 'Jost' } },
            title: { display: true, text: 'Frequency', color: '#64748b', font: { family: 'Jost', size: 10 } }
          },
          y1: {
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { color: '#94a3b8', font: { family: 'Jost' }, callback: value => `${value}%` },
            max: 100,
            min: 0,
            title: { display: true, text: 'Cumulative Percent', color: '#64748b', font: { family: 'Jost', size: 10 } }
          }
        }
      }
    });
  }

  function renderSeverityDistributionChart() {
    const canvas = document.getElementById('severity-distribution-chart');
    if (!canvas) return;

    const counts = {
      'Fatality': 0,
      'Lost Workday': 0,
      'Restricted Workday': 0,
      'Medical Treatment': 0,
      'First Aid': 0,
      'Equipment Damage': 0,
      'Near Miss': 0,
      'Other': 0
    };

    rcaRecords.forEach(r => {
      const dest = (r.designation || r.incidentDesignation || 'Other').toLowerCase();
      if (dest.includes('fatality')) {
        counts['Fatality']++;
      } else if (dest.includes('lost workday')) {
        counts['Lost Workday']++;
      } else if (dest.includes('restricted')) {
        counts['Restricted Workday']++;
      } else if (dest.includes('medical') || dest.includes('recordable')) {
        counts['Medical Treatment']++;
      } else if (dest.includes('first aid')) {
        counts['First Aid']++;
      } else if (dest.includes('equipment') || dest.includes('damage')) {
        counts['Equipment Damage']++;
      } else if (dest.includes('near miss') || dest.includes('report only') || dest.includes('report-only')) {
        counts['Near Miss']++;
      } else {
        counts['Other']++;
      }
    });

    const labels = [];
    const dataVals = [];
    const backgroundColors = [];
    const borderColors = [];

    const colorMap = {
      'Fatality': { bg: 'rgba(239, 68, 68, 0.85)', border: '#ef4444' },
      'Lost Workday': { bg: 'rgba(249, 115, 22, 0.85)', border: '#f97316' },
      'Restricted Workday': { bg: 'rgba(245, 158, 11, 0.85)', border: '#f59e0b' },
      'Medical Treatment': { bg: 'rgba(168, 85, 247, 0.85)', border: '#a855f7' },
      'First Aid': { bg: 'rgba(14, 165, 233, 0.85)', border: '#0ea5e9' },
      'Equipment Damage': { bg: 'rgba(236, 72, 153, 0.85)', border: '#ec4899' },
      'Near Miss': { bg: 'rgba(16, 185, 129, 0.85)', border: '#10b981' },
      'Other': { bg: 'rgba(100, 116, 139, 0.85)', border: '#64748b' }
    };

    Object.keys(counts).forEach(key => {
      if (counts[key] > 0) {
        labels.push(key);
        dataVals.push(counts[key]);
        backgroundColors.push(colorMap[key].bg);
        borderColors.push(colorMap[key].border);
      }
    });

    if (severityChart) {
      severityChart.destroy();
    }

    if (labels.length === 0) {
      labels.push('No Data');
      dataVals.push(1);
      backgroundColors.push('rgba(148, 163, 184, 0.08)');
      borderColors.push('rgba(148, 163, 184, 0.15)');
    }

    severityChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: dataVals,
          backgroundColor: backgroundColors,
          borderColor: borderColors,
          borderWidth: 1.5,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: '#94a3b8',
              boxWidth: 10,
              font: { family: 'Jost', size: 9 }
            }
          }
        }
      }
    });
  }

  // --- Excel Import ---
  function handleExcelImport(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();
    
    showToast("Parsing Excel file...", "loading");

    reader.onload = function(evt) {
      try {
        const data = evt.target.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Parse JSON
        const rawRows = XLSX.utils.sheet_to_json(worksheet);
        
        if (rawRows.length === 0) {
          throw new Error("No data rows found in Excel sheet.");
        }

        // Filter out all rows that have a valid incident ID starting with INC-
        const validRows = rawRows.filter(r => r['IGZ ID'] && String(r['IGZ ID']).startsWith('INC-'));
        
        if (validRows.length === 0) {
          throw new Error("Could not find any rows containing a valid incident ID (starting with INC-).");
        }

        // Helper to parse comma-separated lists from cells into arrays
        const parseList = (val) => {
          if (!val) return [];
          if (Array.isArray(val)) return val;
          return String(val).split(',').map(s => s.trim()).filter(Boolean);
        };

        let importCount = 0;
        let lastId = null;

        validRows.forEach(row => {
          const id = row['IGZ ID'];
          lastId = id;
          
          // Check if we already have this record
          const existing = rcaRecords.find(r => r.id === id);
          if (existing && existing.status === 'Completed') {
            // Keep completed RCA to prevent overwriting user work
            return;
          }

          const record = {
            id: id,
            igzId: id,
            employeeName: row['Employee Name'] || '',
            date: normalizeDate(row['Date of Incident - Date']),
            time: row['Time of Incident - Time'] || '',
            location: (row['Incident Location'] || '').trim().toUpperCase() === 'FORMOSA PLASTICS' || (row['Incident Location'] || '').trim() === 'Formosa Plastics' ? 'Formosa Plastics Corporation' : (row['Incident Location'] || '').trim(),
            deptLocation: row['Department Location'] || '',
            supervisor: (row["Employee's Immediate Supervisor"] || '').trim() === '600 Cameron Gregg Allen' ? '585 Cameron Gregg Allen' : (row["Employee's Immediate Supervisor"] || '').trim(),
            businessUnit: row['Business Unit'] || '',
            group: row['Group'] || '',
            craft: row['Craft/Task'] || '',
            jobTitle: row['Job Title'] || '',
            timeInCraft: row['Time in Craft (Years/Months)'] || '',
            dateHired: normalizeDate(row['Date Hired - Date']),
            hoursOnDuty: row['Hours on Duty Prior to Injury'] || '',
            drugScreen: row['Was a Drug Screen Performed?'] || 'No',
            incidentDesignation: row['Incident Designation'] || 'First Aid',
            description: row['DESCRIPTION OF INCIDENT (Who, What, and How)'] || row['Description'] || '',
            
            jhaDisc: parseList(row['Note any JHA/JSA discrepancies']),
            permitDisc: parseList(row['Note any Permit discrepancies']),
            supervisionIssues: parseList(row['Note any supervision/management issues']),
            shortcuts: parseList(row['Note any evidence of shortcuts']),
            complicitBehaviors: parseList(row['Note any complicit behaviours']),
            unsafeConditions: parseList(row['Possible Unsafe Conditions']),
            unsafeActs: parseList(row['Possible Unsafe Acts']),
            ppeDetails: parseList(row['Personal Protective Equipment'] || row['Other / Comments, if applicable']),
            incidentType: parseList(row['Incident Type']),
            bodyInjured: parseList(row['Body Part Injured']),
            natureInjury: parseList(row['Nature of Injury']),
            workAttributes: parseList(row['Work Attributes']),
            envConditions: parseList(row['Environmental Conditions']),
            investigationTeam: parseList(row['Investigation team members']),
            prevActions: parseList(row['Actions to prevent incident re-occurrence']),
            initialComments: row['Other / Comments, if applicable 1'] || '',
            
            status: "Pending Analysis",
            primaryCause: "",
            analysisSummary: "",
            conclusion: "",
            correctiveActions: []
          };

          // Overwrite or insert
          rcaRecords = rcaRecords.filter(r => r.id !== id);
          rcaRecords.push(record);
          importCount++;
        });

        // Sort by date descending
        rcaRecords.sort((a, b) => new Date(b.date) - new Date(a.date));
        // Save all imported records to Firestore
        rcaRecords.forEach(r => {
          if (!r.createdBy) r.createdBy = window.currentUserEmail ? window.currentUserEmail() : '';
          saveRecordAndSync(r);
        });
        renderRegistry();
        renderParetoSummaryChart();
        renderSeverityDistributionChart();

        if (importCount > 1) {
          showToast(`Successfully imported ${importCount} new incidents in bulk!`, "success");
        } else if (importCount === 1) {
          showToast(`Successfully imported incident ${lastId}! Opening wizard.`, "success");
          loadRcaIntoWizard(lastId);
        } else {
          showToast("No new records were imported (already completed or duplicated).", "info");
        }

      } catch (err) {
        console.error("Excel import error:", err);
        showToast(`Failed to parse Excel: ${err.message}`, "error");
      }
    };

    reader.readAsBinaryString(file);
    e.target.value = ''; // Reset file input
  }

  // --- RCA Record CRUD Operations ---
  async function createNewRca() {
    const id = `INC-${Date.now()}`;
    const newRecord = {
      id: id,
      igzId: '',
      employeeName: '',
      date: new Date().toISOString().split('T')[0],
      time: '',
      location: '',
      deptLocation: '',
      supervisor: '',
      businessUnit: '',
      group: '',
      craft: '',
      jobTitle: '',
      timeInCraft: '',
      dateHired: '',
      hoursOnDuty: '',
      drugScreen: 'No',
      incidentDesignation: 'First Aid',
      description: '',
      jhaDisc: '',
      permitDisc: '',
      supervisionIssues: '',
      shortcuts: '',
      complicitBehaviors: '',
      unsafeConditions: '',
      unsafeActs: '',
      ppeDetails: '',
      incidentType: '',
      bodyInjured: '',
      natureInjury: '',
      workAttributes: '',
      envConditions: '',
      investigationTeam: '',
      prevActions: '',
      initialComments: '',
      status: "Pending Analysis",
      primaryCause: "",
      analysisSummary: "",
      conclusion: "",
      correctiveActions: [],
      assignedTo: '',
      createdBy: window.currentUserEmail ? window.currentUserEmail() : ''
    };

    rcaRecords.unshift(newRecord);
    await saveRecordAndSync(newRecord);
    loadRcaIntoWizard(id);
  }

  async function deleteRcaRecord(id) {
    if (!confirm("Are you sure you want to permanently delete this investigation record?")) return;
    try {
      if (window.deleteRecordFromFirestore) {
        await window.deleteRecordFromFirestore(id);
      }
      rcaRecords = rcaRecords.filter(r => r.id !== id);
      renderRegistry();
      renderParetoSummaryChart();
      renderSeverityDistributionChart();
      showToast('Record deleted', 'success');
    } catch (e) {
      showToast('Error deleting record: ' + e.message, 'error');
    }
  }

  // --- Wizard Logic ---
  function loadRcaIntoWizard(id) {
    currentRecord = rcaRecords.find(r => r.id === id);
    if (!currentRecord) return;

    activeStep = 1;
    updateWizardStepUI();

    // Populate Step 1 Form
    document.getElementById('rca-record-id').value = currentRecord.id;
    document.getElementById('f-igz-id').value = currentRecord.igzId || '';
    document.getElementById('f-employee-name').value = currentRecord.employeeName || '';
    document.getElementById('f-date').value = normalizeDate(currentRecord.date) || '';
    document.getElementById('f-time').value = currentRecord.time || '';
    document.getElementById('f-location').value = currentRecord.location || '';
    document.getElementById('f-dept-location').value = currentRecord.deptLocation || '';
    document.getElementById('f-supervisor').value = currentRecord.supervisor || '';
    if (document.getElementById('f-assigned-to')) document.getElementById('f-assigned-to').value = currentRecord.assignedTo || '';
    document.getElementById('f-business-unit').value = currentRecord.businessUnit || '';
    document.getElementById('f-group').value = currentRecord.group || '';
    document.getElementById('f-craft').value = currentRecord.craft || '';
    document.getElementById('f-job-title').value = currentRecord.jobTitle || '';
    document.getElementById('f-time-in-craft').value = currentRecord.timeInCraft || '';
    document.getElementById('f-date-hired').value = normalizeDate(currentRecord.dateHired) || '';
    document.getElementById('f-hours-on-duty').value = currentRecord.hoursOnDuty || '';
    document.getElementById('f-drug-screen').value = currentRecord.drugScreen || 'No';
    document.getElementById('f-incident-designation').value = currentRecord.incidentDesignation || 'First Aid';
    document.getElementById('f-description').value = currentRecord.description || '';
    
    document.getElementById('f-jha-disc').value = currentRecord.jhaDisc || '';
    document.getElementById('f-permit-disc').value = currentRecord.permitDisc || '';
    document.getElementById('f-supervision-issues').value = currentRecord.supervisionIssues || '';
    document.getElementById('f-shortcuts').value = currentRecord.shortcuts || '';
    document.getElementById('f-complicit-behaviors').value = currentRecord.complicitBehaviors || '';
    document.getElementById('f-unsafe-conditions').value = currentRecord.unsafeConditions || '';
    document.getElementById('f-unsafe-acts').value = currentRecord.unsafeActs || '';
    document.getElementById('f-ppe-details').value = currentRecord.ppeDetails || '';
    document.getElementById('f-incident-type').value = currentRecord.incidentType || '';
    document.getElementById('f-body-injured').value = currentRecord.bodyInjured || '';
    document.getElementById('f-nature-injury').value = currentRecord.natureInjury || '';
    document.getElementById('f-work-attributes').value = currentRecord.workAttributes || '';
    document.getElementById('f-env-conditions').value = currentRecord.envConditions || '';
    document.getElementById('f-investigation-team').value = currentRecord.investigationTeam || '';
    document.getElementById('f-prev-actions').value = currentRecord.prevActions || '';
    document.getElementById('f-initial-comments').value = currentRecord.initialComments || '';

    // Populate Step 2 Q&A
    const dq = currentRecord.drivingOutcome || {};
    document.getElementById('dq-doc-jsa').value = dq.docJsa || 'No';
    document.getElementById('dq-doc-procedures').value = dq.docProcedures || 'No';
    document.getElementById('dq-doc-notes').value = dq.docNotes || '';
    document.getElementById('dq-tools-order').value = dq.toolsOrder || 'N/A';
    document.getElementById('dq-tools-ppe').value = dq.toolsPpe || 'No';
    document.getElementById('dq-tools-notes').value = dq.toolsNotes || '';
    document.getElementById('dq-sup-present').value = dq.supPresent || 'No';
    document.getElementById('dq-sup-intervention').value = dq.supIntervention || 'No';
    document.getElementById('dq-sup-notes').value = dq.supNotes || '';
    document.getElementById('dq-kn-trained').value = dq.knTrained || 'Yes';
    document.getElementById('dq-kn-hazard-comm').value = dq.knHazardComm || 'No';
    document.getElementById('dq-kn-notes').value = dq.knNotes || '';
    document.getElementById('dq-comp-followed').value = dq.compFollowed || 'No';
    document.getElementById('dq-comp-ppe').value = dq.compPpe || 'No';
    document.getElementById('dq-comp-notes').value = dq.compNotes || '';
    document.getElementById('dq-short-bypassed').value = dq.shortBypassed || 'No';
    document.getElementById('dq-short-pressure').value = dq.shortPressure || 'No';
    document.getElementById('dq-short-notes').value = dq.shortNotes || '';
    document.getElementById('dq-env-contributed').value = dq.envContributed || 'No';
    document.getElementById('dq-env-unforeseen').value = dq.envUnforeseen || 'No';
    document.getElementById('dq-env-notes').value = dq.envNotes || '';

    // Populate Step 3: 5 Whys
    const whys = currentRecord.fiveWhys || [
      { q: "Why did the employee sustain a left knee injury?", a: "" },
      { q: "Why did his foot slip?", a: "" },
      { q: "Why was the employee exposed to this unmitigated slip hazard?", a: "" },
      { q: "Why were hazard identification, mitigation steps, and PPE controls not followed?", a: "" },
      { q: "Why was there non-compliance with JSA, PPE, and hazard control procedures?", a: "" }
    ];
    document.getElementById('why-incident').value = currentRecord.description || '';
    document.getElementById('why-1').value = whys[0]?.a || '';
    document.getElementById('why-2').value = whys[1]?.a || '';
    document.getElementById('why-3').value = whys[2]?.a || '';
    document.getElementById('why-4').value = whys[3]?.a || '';
    document.getElementById('why-5').value = whys[4]?.a || '';

    // Populate Step 4: KT Matrix
    const kt = currentRecord.ktAnalysis || {};
    document.getElementById('kt-what-is').value = kt.whatIs || '';
    document.getElementById('kt-what-isnot').value = kt.whatIsNot || '';
    document.getElementById('kt-what-dist').value = kt.whatDist || '';
    document.getElementById('kt-where-is').value = kt.whereIs || '';
    document.getElementById('kt-where-isnot').value = kt.whereIsNot || '';
    document.getElementById('kt-where-dist').value = kt.whereDist || '';
    document.getElementById('kt-when-is').value = kt.whenIs || '';
    document.getElementById('kt-when-isnot').value = kt.whenIsNot || '';
    document.getElementById('kt-when-dist').value = kt.whenDist || '';
    document.getElementById('kt-extent-is').value = kt.extentIs || '';
    document.getElementById('kt-extent-isnot').value = kt.extentIsNot || '';
    document.getElementById('kt-extent-dist').value = kt.extentDist || '';
    document.getElementById('kt-probable-cause').value = kt.probableCause || '';

    // Populate Step 4: Pareto
    const p = currentRecord.pareto || { compliance: 40, ppe: 25, supervision: 15, complicity: 10, env: 10 };
    setSliderValue('sl-pareto-compliance', p.compliance);
    setSliderValue('sl-pareto-ppe', p.ppe);
    setSliderValue('sl-pareto-supervision', p.supervision);
    setSliderValue('sl-pareto-complicity', p.complicity);
    setSliderValue('sl-pareto-env', p.env);
    validateParetoSum();

    // Populate Step 5: Root Cause & Violations
    document.getElementById('f-primary-cause').value = currentRecord.primaryCause || "Procedural Non-Compliance";
    document.getElementById('f-contributing-factors').value = currentRecord.contributingFactors || '';
    document.getElementById('f-analysis-summary').value = currentRecord.analysisSummary || '';
    document.getElementById('f-conclusion').value = currentRecord.conclusion || '';

    const ro = currentRecord.ruledOut || {};
    document.getElementById('ro-prep').value = ro.prep || '';
    document.getElementById('ro-equip').value = ro.equip || '';
    document.getElementById('ro-fatigue').value = ro.fatigue || '';
    document.getElementById('ro-shortcuts').value = ro.shortcuts || '';
    document.getElementById('ro-knowledge').value = ro.knowledge || '';
    document.getElementById('ro-env').value = ro.env || '';
    document.getElementById('ro-complacency').value = ro.complacency || '';
    document.getElementById('ro-deliberate').value = ro.deliberate || '';

    const v = currentRecord.procedureViolations || {};
    document.getElementById('v-swp33').value = v.swp33 || '';
    document.getElementById('v-swp47').value = v.swp47 || '';
    document.getElementById('v-other').value = v.other || '';

    // Populate Step 6: Corrective Actions
    const actionsBody = document.getElementById('actions-builder-body');
    actionsBody.innerHTML = '';
    const actions = currentRecord.correctiveActions || [];
    if (actions.length === 0) {
      // Add a couple of empty rows
      addCorrectiveActionRow('', '', '', '');
      addCorrectiveActionRow('', '', '', '');
    } else {
      actions.forEach(a => addCorrectiveActionRow(a.title, a.desc, a.responsible, a.dueDate));
    }
    document.getElementById('f-additional-notes').value = currentRecord.additionalNotes || '';

    switchTab('wizard');
  }

  function setSliderValue(id, val) {
    const slider = document.getElementById(id);
    if (slider) {
      slider.value = val;
      const key = id.replace('sl-pareto-', '');
      document.getElementById(`v-pareto-${key}`).innerText = `${val}%`;
    }
  }

  function validateParetoSum() {
    const comp = parseInt(document.getElementById('sl-pareto-compliance').value) || 0;
    const ppe = parseInt(document.getElementById('sl-pareto-ppe').value) || 0;
    const sup = parseInt(document.getElementById('sl-pareto-supervision').value) || 0;
    const compy = parseInt(document.getElementById('sl-pareto-complicity').value) || 0;
    const env = parseInt(document.getElementById('sl-pareto-env').value) || 0;

    const total = comp + ppe + sup + compy + env;
    const totalValEl = document.getElementById('pareto-total-val');
    const msgEl = document.getElementById('pareto-validation-msg');
    
    totalValEl.innerText = total;

    if (total === 100) {
      msgEl.innerText = "(Valid)";
      msgEl.className = "text-success";
      document.getElementById('pareto-total-bar').style.borderLeft = "4px solid #10b981";
      return true;
    } else {
      msgEl.innerText = `(Invalid - must equal 100%, current delta: ${100 - total}%)`;
      msgEl.className = "text-danger";
      document.getElementById('pareto-total-bar').style.borderLeft = "4px solid #ef4444";
      return false;
    }
  }

  function addCorrectiveActionRow(title, desc, responsible, dueDate) {
    const tbody = document.getElementById('actions-builder-body');
    const tr = document.createElement('tr');
    tr.className = "action-row-item";
    
    tr.innerHTML = `
      <td><input type="text" class="act-title" value="${title}" placeholder="Action Title"></td>
      <td><textarea class="act-desc" rows="2" placeholder="Description of corrective task...">${desc}</textarea></td>
      <td><input type="text" class="act-resp" value="${responsible}" placeholder="Safety Manager / PM"></td>
      <td><input type="date" class="act-date" value="${dueDate}"></td>
      <td style="text-align: center;">
        <button type="button" class="btn-action-icon text-danger btn-remove-row" style="border: none;">
          <i data-lucide="minus-circle"></i>
        </button>
      </td>
    `;
    
    tr.querySelector('.btn-remove-row').addEventListener('click', () => {
      tr.remove();
    });

    tbody.appendChild(tr);
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function updateWizardStepUI() {
    // Hide all step contents
    document.querySelectorAll('.step-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));

    // Show current step content
    document.getElementById(`step-content-${activeStep}`).classList.remove('hidden');
    document.getElementById(`step-content-${activeStep}`).classList.add('active');

    // Update active sidebar steps
    document.querySelectorAll('.wizard-step').forEach(el => {
      const stepNum = parseInt(el.getAttribute('data-step'));
      if (stepNum === activeStep) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    // Update buttons
    const prevBtn = document.getElementById('btn-wizard-prev');
    const nextBtn = document.getElementById('btn-wizard-next');
    const finalizeBtn = document.getElementById('btn-wizard-finalize');

    prevBtn.disabled = activeStep === 1;
    
    if (activeStep === 6) {
      nextBtn.classList.add('hidden');
      finalizeBtn.classList.remove('hidden');
    } else {
      nextBtn.classList.remove('hidden');
      finalizeBtn.classList.add('hidden');
    }
  }

  function nextStep() {
    if (activeStep < 6) {
      activeStep++;
      updateWizardStepUI();
      // Scroll wizard body to top
      document.querySelector('.wizard-content-wrapper').scrollTop = 0;
    }
  }

  function prevStep() {
    if (activeStep > 1) {
      activeStep--;
      updateWizardStepUI();
      document.querySelector('.wizard-content-wrapper').scrollTop = 0;
    }
  }

  // --- Save / Finalize Logic ---
  function getRcaDataFromWizard() {
    // Compile corrective actions
    const actions = [];
    document.querySelectorAll('.action-row-item').forEach(tr => {
      const title = tr.querySelector('.act-title').value.trim();
      const desc = tr.querySelector('.act-desc').value.trim();
      const resp = tr.querySelector('.act-resp').value.trim();
      const date = tr.querySelector('.act-date').value;
      
      if (title) {
        actions.push({ title, desc, responsible: resp, dueDate: date });
      }
    });

    return {
      id: document.getElementById('rca-record-id').value,
      igzId: document.getElementById('f-igz-id').value.trim(),
      employeeName: document.getElementById('f-employee-name').value.trim(),
      date: document.getElementById('f-date').value,
      time: document.getElementById('f-time').value.trim(),
      location: document.getElementById('f-location').value.trim(),
      deptLocation: document.getElementById('f-dept-location').value.trim(),
      supervisor: document.getElementById('f-supervisor').value.trim(),
      assignedTo: document.getElementById('f-assigned-to')?.value || '',
      businessUnit: document.getElementById('f-business-unit').value.trim(),
      group: document.getElementById('f-group').value.trim(),
      craft: document.getElementById('f-craft').value.trim(),
      jobTitle: document.getElementById('f-job-title').value.trim(),
      timeInCraft: document.getElementById('f-time-in-craft').value.trim(),
      dateHired: document.getElementById('f-date-hired').value,
      hoursOnDuty: document.getElementById('f-hours-on-duty').value.trim(),
      drugScreen: document.getElementById('f-drug-screen').value,
      incidentDesignation: document.getElementById('f-incident-designation').value,
      description: document.getElementById('f-description').value.trim(),
      
      jhaDisc: document.getElementById('f-jha-disc').value.trim(),
      permitDisc: document.getElementById('f-permit-disc').value.trim(),
      supervisionIssues: document.getElementById('f-supervision-issues').value.trim(),
      shortcuts: document.getElementById('f-shortcuts').value.trim(),
      complicitBehaviors: document.getElementById('f-complicit-behaviors').value.trim(),
      unsafeConditions: document.getElementById('f-unsafe-conditions').value.trim(),
      unsafeActs: document.getElementById('f-unsafe-acts').value.trim(),
      ppeDetails: document.getElementById('f-ppe-details').value.trim(),
      incidentType: document.getElementById('f-incident-type').value.trim(),
      bodyInjured: document.getElementById('f-body-injured').value.trim(),
      natureInjury: document.getElementById('f-nature-injury').value.trim(),
      workAttributes: document.getElementById('f-work-attributes').value.trim(),
      envConditions: document.getElementById('f-env-conditions').value.trim(),
      investigationTeam: document.getElementById('f-investigation-team').value.trim(),
      prevActions: document.getElementById('f-prev-actions').value.trim(),
      initialComments: document.getElementById('f-initial-comments').value.trim(),

      drivingOutcome: {
        docJsa: document.getElementById('dq-doc-jsa').value,
        docProcedures: document.getElementById('dq-doc-procedures').value,
        docNotes: document.getElementById('dq-doc-notes').value.trim(),
        toolsOrder: document.getElementById('dq-tools-order').value,
        toolsPpe: document.getElementById('dq-tools-ppe').value,
        toolsNotes: document.getElementById('dq-tools-notes').value.trim(),
        supPresent: document.getElementById('dq-sup-present').value,
        supIntervention: document.getElementById('dq-sup-intervention').value,
        supNotes: document.getElementById('dq-sup-notes').value.trim(),
        knTrained: document.getElementById('dq-kn-trained').value,
        knHazardComm: document.getElementById('dq-kn-hazard-comm').value,
        knNotes: document.getElementById('dq-kn-notes').value.trim(),
        compFollowed: document.getElementById('dq-comp-followed').value,
        compPpe: document.getElementById('dq-comp-ppe').value,
        compNotes: document.getElementById('dq-comp-notes').value.trim(),
        shortBypassed: document.getElementById('dq-short-bypassed').value,
        shortPressure: document.getElementById('dq-short-pressure').value,
        shortNotes: document.getElementById('dq-short-notes').value.trim(),
        envContributed: document.getElementById('dq-env-contributed').value,
        envUnforeseen: document.getElementById('dq-env-unforeseen').value,
        envNotes: document.getElementById('dq-env-notes').value.trim()
      },

      fiveWhys: [
        { q: "Why did the employee sustain a left knee injury?", a: document.getElementById('why-1').value.trim() },
        { q: "Why did his foot slip?", a: document.getElementById('why-2').value.trim() },
        { q: "Why was the employee exposed to this unmitigated slip hazard?", a: document.getElementById('why-3').value.trim() },
        { q: "Why were hazard identification, mitigation steps, and PPE controls not followed?", a: document.getElementById('why-4').value.trim() },
        { q: "Why was there non-compliance with JSA, PPE, and hazard control procedures?", a: document.getElementById('why-5').value.trim() }
      ],

      ktAnalysis: {
        whatIs: document.getElementById('kt-what-is').value.trim(),
        whatIsNot: document.getElementById('kt-what-isnot').value.trim(),
        whatDist: document.getElementById('kt-what-dist').value.trim(),
        whereIs: document.getElementById('kt-where-is').value.trim(),
        whereIsNot: document.getElementById('kt-where-isnot').value.trim(),
        whereDist: document.getElementById('kt-where-dist').value.trim(),
        whenIs: document.getElementById('kt-when-is').value.trim(),
        whenIsNot: document.getElementById('kt-when-isnot').value.trim(),
        whenDist: document.getElementById('kt-when-dist').value.trim(),
        extentIs: document.getElementById('kt-extent-is').value.trim(),
        extentIsNot: document.getElementById('kt-extent-isnot').value.trim(),
        extentDist: document.getElementById('kt-extent-dist').value.trim(),
        probableCause: document.getElementById('kt-probable-cause').value.trim()
      },

      pareto: {
        compliance: parseInt(document.getElementById('sl-pareto-compliance').value) || 0,
        ppe: parseInt(document.getElementById('sl-pareto-ppe').value) || 0,
        supervision: parseInt(document.getElementById('sl-pareto-supervision').value) || 0,
        complicity: parseInt(document.getElementById('sl-pareto-complicity').value) || 0,
        env: parseInt(document.getElementById('sl-pareto-env').value) || 0
      },

      primaryCause: document.getElementById('f-primary-cause').value,
      contributingFactors: document.getElementById('f-contributing-factors').value.trim(),
      analysisSummary: document.getElementById('f-analysis-summary').value.trim(),
      conclusion: document.getElementById('f-conclusion').value.trim(),

      ruledOut: {
        prep: document.getElementById('ro-prep').value.trim(),
        equip: document.getElementById('ro-equip').value.trim(),
        fatigue: document.getElementById('ro-fatigue').value.trim(),
        shortcuts: document.getElementById('ro-shortcuts').value.trim(),
        knowledge: document.getElementById('ro-knowledge').value.trim(),
        env: document.getElementById('ro-env').value.trim(),
        complacency: document.getElementById('ro-complacency').value.trim(),
        deliberate: document.getElementById('ro-deliberate').value.trim()
      },

      procedureViolations: {
        swp33: document.getElementById('v-swp33').value.trim(),
        swp47: document.getElementById('v-swp47').value.trim(),
        other: document.getElementById('v-other').value.trim()
      },

      additionalNotes: document.getElementById('f-additional-notes').value.trim(),
      correctiveActions: actions
    };
  }

  async function saveDraftRca() {
    const data = getRcaDataFromWizard();
    data.status = "Pending Analysis";
    data.assignedTo = document.getElementById('f-assigned-to')?.value || '';
    if (!data.createdBy) data.createdBy = window.currentUserEmail ? window.currentUserEmail() : '';
    
    await saveRecordAndSync(data);
    // Update local array
    rcaRecords = rcaRecords.filter(r => r.id !== data.id);
    rcaRecords.unshift(data);
    
    showToast("Investigation saved as draft", "success");
    switchTab('dashboard');
  }

  function finalizeRca() {
    // Validate Pareto sum
    if (!validateParetoSum()) {
      showToast("Pareto Cause weights must sum to exactly 100% before finalizing.", "error");
      activeStep = 4;
      updateWizardStepUI();
      return;
    }

    const data = getRcaDataFromWizard();
    data.status = "Completed";
    data.assignedTo = document.getElementById('f-assigned-to')?.value || '';
    if (!data.createdBy) data.createdBy = window.currentUserEmail ? window.currentUserEmail() : '';
    
    saveRecordAndSync(data);
    // Update local array
    rcaRecords = rcaRecords.filter(r => r.id !== data.id);
    rcaRecords.unshift(data);
    
    showToast("Root Cause Analysis Finalized!", "success");
    loadRcaIntoReport(data.id);
  }

  // --- Report Render Logic ---
  function loadRcaIntoReport(id) {
    const record = rcaRecords.find(r => r.id === id);
    if (!record) return;

    // Set Header
    document.getElementById('rep-hdr-igz').innerText = record.igzId || record.id;
    document.getElementById('rep-hdr-status').innerText = record.status;
    document.getElementById('rep-hdr-status').className = record.status === 'Completed' ? 'status-badge-inline' : 'status-badge-inline pending';

    // Set Meta
    document.getElementById('rep-employee').innerText = record.employeeName || 'N/A';
    document.getElementById('rep-datetime').innerText = `${record.date || 'N/A'} @ ${record.time || 'N/A'}`;
    document.getElementById('rep-location').innerText = `${record.location || 'N/A'} ${record.deptLocation ? `- ${record.deptLocation}` : ''}`;
    document.getElementById('rep-supervisor').innerText = record.supervisor || 'N/A';
    document.getElementById('rep-craft').innerText = `${record.craft || 'N/A'} ${record.jobTitle ? `(${record.jobTitle})` : ''}`;
    document.getElementById('rep-experience').innerText = record.timeInCraft || 'N/A';
    document.getElementById('rep-bugroup').innerText = `${record.businessUnit || 'N/A'} / ${record.group || 'N/A'}`;
    document.getElementById('rep-hours').innerText = record.hoursOnDuty || 'N/A';
    document.getElementById('rep-type').innerText = `${record.incidentType ? record.incidentType.replace(/#/g, ' / ') : 'N/A'} ${record.bodyInjured ? `(${record.bodyInjured})` : ''}`;
    document.getElementById('rep-drug').innerText = record.drugScreen || 'N/A';
    document.getElementById('rep-env').innerText = record.envConditions || 'N/A';
    document.getElementById('rep-attrib').innerText = record.workAttributes || 'N/A';

    // Descriptions & Analysis
    document.getElementById('rep-description').innerText = record.description || 'N/A';
    document.getElementById('rep-primary-cause').innerText = record.primaryCause || 'None Selected';
    document.getElementById('rep-analysis').innerText = record.analysisSummary || 'N/A';
    document.getElementById('rep-conclusion').innerText = record.conclusion || 'N/A';

    // Contributing factors list
    const bulletsList = document.getElementById('rep-bullets-contrib');
    bulletsList.innerHTML = '';
    const cf = record.contributingFactors || '';
    if (cf) {
      cf.split('\n').forEach(line => {
        if (line.trim()) {
          const li = document.createElement('li');
          li.innerText = line.replace(/^[•\-\*]\s*/, '').trim();
          bulletsList.appendChild(li);
        }
      });
    } else {
      bulletsList.innerHTML = '<li>No specific contributing factors listed.</li>';
    }

    // 5 Whys Chain
    const whysContainer = document.getElementById('rep-whys-list');
    whysContainer.innerHTML = '';
    const whys = record.fiveWhys || [];
    whys.forEach((w, idx) => {
      const div = document.createElement('div');
      div.className = "rep-why-item";
      div.innerHTML = `<span class="rep-why-label">Why ${idx + 1}:</span> ${w.a || '(Not answered)'}`;
      whysContainer.appendChild(div);
    });

    // KT Summary
    const kt = record.ktAnalysis || {};
    document.getElementById('rep-kt-summary').innerText = kt.probableCause || 'No isolation analysis documented.';

    // Pareto weights rendering
    const paretoTbody = document.getElementById('rep-pareto-rows');
    paretoTbody.innerHTML = '';
    const p = record.pareto || { compliance: 0, ppe: 0, supervision: 0, complicity: 0, env: 0 };
    const elements = [
      { name: "Procedural Non-Compliance", weight: p.compliance },
      { name: "Inadequate PPE / Footwear", weight: p.ppe },
      { name: "Supervisor Absence / Lapses", weight: p.supervision },
      { name: "Peer Failure / Complicity", weight: p.complicity },
      { name: "Environmental Conditions", weight: p.env }
    ].sort((a,b) => b.weight - a.weight);

    elements.forEach(el => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="width: 40%; font-weight: 600;">${el.name}</td>
        <td style="width: 15%;">${el.weight}%</td>
        <td style="width: 45%;">
          <div class="rep-bar-outer">
            <div class="rep-bar-inner" style="width: ${el.weight}%;"></div>
          </div>
        </td>
      `;
      paretoTbody.appendChild(tr);
    });

    // Violations Rendering
    const vi = record.procedureViolations || {};
    document.getElementById('rep-viol-jsa').innerText = vi.swp33 || 'No specific violations recorded.';
    document.getElementById('rep-viol-ppe').innerText = vi.swp47 || 'No specific violations recorded.';
    document.getElementById('rep-viol-other').innerText = vi.other || 'No specific violations recorded.';

    // Corrective Actions Rendering
    const actionsTbody = document.getElementById('rep-actions-rows');
    actionsTbody.innerHTML = '';
    const actions = record.correctiveActions || [];
    if (actions.length === 0) {
      actionsTbody.innerHTML = `<tr><td colspan="4" style="color: #6b7280; text-align: center;">No corrective actions established.</td></tr>`;
    } else {
      actions.forEach(a => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${a.title}</strong></td>
          <td>${a.desc}</td>
          <td>${a.responsible}</td>
          <td>${a.dueDate}</td>
        `;
        actionsTbody.appendChild(tr);
      });
    }

    // Ruled out causes rendering
    const ruledTbody = document.getElementById('rep-ruled-out-rows');
    ruledTbody.innerHTML = '';
    const ro = record.ruledOut || {};
    const alternateCauses = [
      { rc: "RC 1: Inadequate Preparation/Planning", reason: ro.prep },
      { rc: "RC 2: Equipment/Resource Failure", reason: ro.equip },
      { rc: "RC 3: Fatigue", reason: ro.fatigue },
      { rc: "RC 5: Pressure and Shortcuts", reason: ro.shortcuts },
      { rc: "RC 6: Knowledge Gaps", reason: ro.knowledge },
      { rc: "RC 7: Environmental Interference", reason: ro.env },
      { rc: "RC 8: Complacency", reason: ro.complacency },
      { rc: "RC 9: Deliberate Violation", reason: ro.deliberate }
    ];

    alternateCauses.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 600;">${c.rc}</td>
        <td>${c.reason || 'Ruled out based on primary incident analysis details.'}</td>
      `;
      ruledTbody.appendChild(tr);
    });

    // Additional notes
    const addNotesEl = document.getElementById('rep-additional-notes');
    if (record.additionalNotes) {
      document.getElementById('rep-add-notes-section').classList.remove('hidden');
      addNotesEl.innerText = record.additionalNotes;
    } else {
      document.getElementById('rep-add-notes-section').classList.add('hidden');
    }

    switchTab('report');
  }

  // --- Gemini AI Generator Logic ---
  async function generateRcaWithAI() {
    const igzId = document.getElementById('f-igz-id').value.trim();
    const employee = document.getElementById('f-employee-name').value.trim();
    const descText = document.getElementById('f-description').value.trim();
    const craft = document.getElementById('f-craft').value.trim();
    const location = document.getElementById('f-location').value.trim();
    
    if (!descText) {
      showToast("Please enter an incident description in Step 1 before generating analysis.", "error");
      return;
    }

    const generateBtn = document.getElementById('btn-ai-generate');
    const indicator = document.getElementById('ai-loading-indicator');
    
    generateBtn.disabled = true;
    indicator.classList.remove('hidden');
    
    showToast("Gemini AI is performing investigation root cause isolation...", "loading");

    // Gather metadata context
    const metadataContext = {
      igzId,
      employee,
      location,
      craft,
      date: document.getElementById('f-date').value,
      businessUnit: document.getElementById('f-business-unit').value.trim(),
      group: document.getElementById('f-group').value.trim(),
      hoursOnDuty: document.getElementById('f-hours-on-duty').value.trim(),
      jhaDisc: document.getElementById('f-jha-disc').value.trim(),
      permitDisc: document.getElementById('f-permit-disc').value.trim(),
      supervisionIssues: document.getElementById('f-supervision-issues').value.trim(),
      shortcuts: document.getElementById('f-shortcuts').value.trim(),
      complicitBehaviors: document.getElementById('f-complicit-behaviors').value.trim(),
      unsafeConditions: document.getElementById('f-unsafe-conditions').value.trim(),
      unsafeActs: document.getElementById('f-unsafe-acts').value.trim(),
      ppeDetails: document.getElementById('f-ppe-details').value.trim(),
      envConditions: document.getElementById('f-env-conditions').value.trim(),
      prevActions: document.getElementById('f-prev-actions').value.trim(),
      initialComments: document.getElementById('f-initial-comments').value.trim()
    };

    const promptText = `
You are a professional Health, Safety, and Environment (HSE) incident analyst. 
You are performing a Root Cause Analysis (RCA) report for Taurus Industrial Group (TIG). 
Do NOT refer to "Turnaround Tech Service" in the outputs, use "Taurus Industrial Group" or "TIG" instead.

Incident Description:
${descText}

Supervisor Investigation Report Metadata:
${JSON.stringify(metadataContext, null, 2)}

Based on this incident profile, identify the primary root cause out of the Nine Standard Root Causes:
1. Inadequate Preparation and Planning
2. Equipment or Resource Failure
3. Fatigue
4. Procedural Non-Compliance
5. Pressure and Shortcuts
6. Knowledge Gaps
7. Environmental Interference
8. Complacency
9. Deliberate Violation

Determine the most logical root cause based on discrepancies (e.g. poor JSA quality, worn boots lacking traction, supervisor absence, safety measures bypassed, wet rain/algae conditions).

Provide the output strictly as a JSON object with the following structure (do not include markdown wrapping or other text):
{
  "primaryCause": "Select one of the exact 9 root causes above",
  "analysisSummary": "1-2 paragraphs detailing the incident timeline and why the selected root cause is primary, referencing safety rules/violations.",
  "contributingFactors": "Bullet points list of all contributing factors (one per line, starting with •)",
  "ruledOut": {
    "prep": "Rationale for ruling out RC 1",
    "equip": "Rationale for ruling out RC 2",
    "fatigue": "Rationale for ruling out RC 3",
    "shortcuts": "Rationale for ruling out RC 5",
    "knowledge": "Rationale for ruling out RC 6",
    "env": "Rationale for ruling out RC 7",
    "complacency": "Rationale for ruling out RC 8",
    "deliberate": "Rationale for ruling out RC 9"
  },
  "fiveWhys": [
    { "q": "Why 1 question", "a": "Why 1 answer" },
    { "q": "Why 2 question", "a": "Why 2 answer" },
    { "q": "Why 3 question", "a": "Why 3 answer" },
    { "q": "Why 4 question", "a": "Why 4 answer" },
    { "q": "Why 5 question", "a": "Why 5 answer" }
  ],
  "ktAnalysis": {
    "whatIs": "Details on what occurred",
    "whatIsNot": "Details on what did not occur",
    "whatDist": "Distinction observed",
    "whereIs": "Where occurred",
    "whereIsNot": "Where did not occur",
    "whereDist": "Distinction observed",
    "whenIs": "When occurred",
    "whenIsNot": "When did not occur",
    "whenDist": "Distinction observed",
    "extentIs": "Extent occurred",
    "extentIsNot": "Extent did not occur",
    "extentDist": "Distinction observed",
    "probableCause": "Summary isolation conclusion isolating why the cause occurred"
  },
  "pareto": {
    "compliance": 40,
    "ppe": 25,
    "supervision": 15,
    "complicity": 10,
    "env": 10
  },
  "drivingOutcome": {
    "docJsa": "Yes/No",
    "docProcedures": "Yes/No",
    "docNotes": "Explanation of JSA discrepancies",
    "toolsOrder": "Yes/No/N/A",
    "toolsPpe": "Yes/No",
    "toolsNotes": "Footwear condition, boots issues details",
    "supPresent": "Yes/No",
    "supIntervention": "Yes/No",
    "supNotes": "Supervisor presence/lapse details",
    "knTrained": "Yes/No",
    "knHazardComm": "Yes/No",
    "knNotes": "Knowledge or communication gaps",
    "compFollowed": "Yes/No",
    "compPpe": "Yes/No",
    "compNotes": "Procedural compliance details",
    "shortBypassed": "Yes/No",
    "shortPressure": "Yes/No",
    "shortNotes": "Bypassing safety measures, time pressure",
    "envContributed": "Yes/No",
    "envUnforeseen": "Yes/No",
    "envNotes": "Rain, algae, walking surface details"
  },
  "conclusion": "Paragraph summarizing root cause, contributing factors, and mechanism.",
  "correctiveActions": [
    { "title": "Corrective Action 1 Title", "desc": "Detailed description of action (link to SWP-033, SWP-047 if appropriate)", "responsible": "Safety Manager or Supervisor Name", "dueDate": "YYYY-MM-DD" },
    { "title": "Corrective Action 2 Title", "desc": "Detailed description...", "responsible": "Site Supervisor", "dueDate": "YYYY-MM-DD" },
    { "title": "Corrective Action 3 Title", "desc": "Detailed description...", "responsible": "Project Manager", "dueDate": "YYYY-MM-DD" },
    { "title": "Corrective Action 4 Title", "desc": "Detailed description...", "responsible": "Owner/Safety Rep", "dueDate": "YYYY-MM-DD" }
  ],
  "procedureViolations": {
    "swp33": "Violations of SWP-033 JSA policies.",
    "swp47": "Violations of SWP-047 PPE policies.",
    "other": "Supervision or peer intervention policy violations."
  },
  "additionalNotes": "Additional investigation comments."
}
`;

    try {
      const model = "gemini-3.5-flash";
      const isLocal = window.location.protocol === "file:" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      const useProxy = !isLocal;
      const maxRetries = 5;
      let response;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (useProxy) {
          response = await fetch("/api/gemini-proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model, contents: [{ parts: [{ text: promptText }] }] })
          });
        } else {
          const key = localStorage.getItem("gemini_api_key") || localStorage.getItem("geminiApiKey") || localStorage.getItem("tig_gemini_key") || "";
          if (!key) throw new Error("Gemini API Key is missing.");
          response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
          });
        }

        if (response.status === 429 && attempt < maxRetries) {
          const waitSec = Math.pow(2, attempt + 1) + Math.random() * 2;
          showToast(`Rate limited. Retrying in ${Math.ceil(waitSec)}s...`, "warning");
          await new Promise(r => setTimeout(r, waitSec * 1000));
          continue;
        }
        break;
      }

      if (!response.ok) {
        throw new Error(`API error ${response.status}`);
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error("Empty response received from Gemini.");

      // Clean up markdown markers in JSON
      const cleanJSON = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanJSON);

      // Populate form fields with parsed results
      document.getElementById('f-primary-cause').value = parsed.primaryCause || 'Procedural Non-Compliance';
      document.getElementById('f-contributing-factors').value = parsed.contributingFactors || '';
      document.getElementById('f-analysis-summary').value = parsed.analysisSummary || '';
      document.getElementById('f-conclusion').value = parsed.conclusion || '';

      const ro = parsed.ruledOut || {};
      document.getElementById('ro-prep').value = ro.prep || '';
      document.getElementById('ro-equip').value = ro.equip || '';
      document.getElementById('ro-fatigue').value = ro.fatigue || '';
      document.getElementById('ro-shortcuts').value = ro.shortcuts || '';
      document.getElementById('ro-knowledge').value = ro.knowledge || '';
      document.getElementById('ro-env').value = ro.env || '';
      document.getElementById('ro-complacency').value = ro.complacency || '';
      document.getElementById('ro-deliberate').value = ro.deliberate || '';

      // Driving outcome Q&As
      const dq = parsed.drivingOutcome || {};
      document.getElementById('dq-doc-jsa').value = dq.docJsa || 'No';
      document.getElementById('dq-doc-procedures').value = dq.docProcedures || 'No';
      document.getElementById('dq-doc-notes').value = dq.docNotes || '';
      document.getElementById('dq-tools-order').value = dq.toolsOrder || 'N/A';
      document.getElementById('dq-tools-ppe').value = dq.toolsPpe || 'No';
      document.getElementById('dq-tools-notes').value = dq.toolsNotes || '';
      document.getElementById('dq-sup-present').value = dq.supPresent || 'No';
      document.getElementById('dq-sup-intervention').value = dq.supIntervention || 'No';
      document.getElementById('dq-sup-notes').value = dq.supNotes || '';
      document.getElementById('dq-kn-trained').value = dq.knTrained || 'Yes';
      document.getElementById('dq-kn-hazard-comm').value = dq.knHazardComm || 'No';
      document.getElementById('dq-kn-notes').value = dq.knNotes || '';
      document.getElementById('dq-comp-followed').value = dq.compFollowed || 'No';
      document.getElementById('dq-comp-ppe').value = dq.compPpe || 'No';
      document.getElementById('dq-comp-notes').value = dq.compNotes || '';
      document.getElementById('dq-short-bypassed').value = dq.shortBypassed || 'No';
      document.getElementById('dq-short-pressure').value = dq.shortPressure || 'No';
      document.getElementById('dq-short-notes').value = dq.shortNotes || '';
      document.getElementById('dq-env-contributed').value = dq.envContributed || 'No';
      document.getElementById('dq-env-unforeseen').value = dq.envUnforeseen || 'No';
      document.getElementById('dq-env-notes').value = dq.envNotes || '';

      // Whys
      const whys = parsed.fiveWhys || [];
      document.getElementById('why-1').value = whys[0]?.a || '';
      document.getElementById('why-2').value = whys[1]?.a || '';
      document.getElementById('why-3').value = whys[2]?.a || '';
      document.getElementById('why-4').value = whys[3]?.a || '';
      document.getElementById('why-5').value = whys[4]?.a || '';

      // KT
      const kt = parsed.ktAnalysis || {};
      document.getElementById('kt-what-is').value = kt.whatIs || '';
      document.getElementById('kt-what-isnot').value = kt.whatIsNot || '';
      document.getElementById('kt-what-dist').value = kt.whatDist || '';
      document.getElementById('kt-where-is').value = kt.whereIs || '';
      document.getElementById('kt-where-isnot').value = kt.whereIsNot || '';
      document.getElementById('kt-where-dist').value = kt.whereDist || '';
      document.getElementById('kt-when-is').value = kt.whenIs || '';
      document.getElementById('kt-when-isnot').value = kt.whenIsNot || '';
      document.getElementById('kt-when-dist').value = kt.whenDist || '';
      document.getElementById('kt-extent-is').value = kt.extentIs || '';
      document.getElementById('kt-extent-isnot').value = kt.extentIsNot || '';
      document.getElementById('kt-extent-dist').value = kt.extentDist || '';
      document.getElementById('kt-probable-cause').value = kt.probableCause || '';

      // Pareto Sliders
      const p = parsed.pareto || { compliance: 40, ppe: 25, supervision: 15, complicity: 10, env: 10 };
      setSliderValue('sl-pareto-compliance', p.compliance);
      setSliderValue('sl-pareto-ppe', p.ppe);
      setSliderValue('sl-pareto-supervision', p.supervision);
      setSliderValue('sl-pareto-complicity', p.complicity);
      setSliderValue('sl-pareto-env', p.env);
      validateParetoSum();

      // Violations
      const v = parsed.procedureViolations || {};
      document.getElementById('v-swp33').value = v.swp33 || '';
      document.getElementById('v-swp47').value = v.swp47 || '';
      document.getElementById('v-other').value = v.other || '';

      // Corrective actions
      const actionsBody = document.getElementById('actions-builder-body');
      actionsBody.innerHTML = '';
      const actions = parsed.correctiveActions || [];
      if (actions.length > 0) {
        actions.forEach(a => addCorrectiveActionRow(a.title, a.desc, a.responsible, normalizeDate(a.dueDate)));
      } else {
        addCorrectiveActionRow('', '', '', '');
      }

      document.getElementById('f-additional-notes').value = parsed.additionalNotes || '';

      showToast("RCA isolation generated successfully! Advancing steps.", "success");
      activeStep = 3; // Advance to 5 Whys to let user inspect
      updateWizardStepUI();

    } catch (err) {
      console.error("AI Generation error:", err);
      showToast(`AI generation failed: ${err.message}. Make sure your API key is configured or you are online.`, "error");
    } finally {
      generateBtn.disabled = false;
      indicator.classList.add('hidden');
    }
  }

  // --- Utility Functions ---
  function showToast(message, type = "success") {
    const container = document.getElementById('toast-container');
    if (!container) return;

    container.classList.remove('hidden');

    // Remove any existing loading toasts when a new toast is shown
    const existingLoaders = container.querySelectorAll('.toast.loading');
    existingLoaders.forEach(l => l.remove());
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.style.cursor = 'pointer'; // Make it visually clickable
    
    let icon = "check-circle";
    if (type === "error") icon = "x-circle";
    if (type === "loading") icon = "loader";

    toast.innerHTML = `
      <i data-lucide="${icon}"></i>
      <span>${message}</span>
    `;

    // Click to dismiss immediately
    toast.addEventListener('click', () => {
      toast.remove();
      if (container.children.length === 0) {
        container.classList.add('hidden');
      }
    });

    container.appendChild(toast);
    
    if (window.lucide) {
      window.lucide.createIcons();
    }

    if (type !== 'loading') {
      setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
          if (toast.parentNode) {
            toast.remove();
          }
          if (container.children.length === 0) {
            container.classList.add('hidden');
          }
        }, 300);
      }, 4000);
    }
  }

  // --- Bulk AI RCA Generator ---
  let bulkCancelRequested = false;

  function compilePromptForRecord(rec) {
    const listToString = (val) => {
      if (!val) return '';
      if (Array.isArray(val)) return val.join(', ');
      return String(val);
    };

    const metadataContext = {
      igzId: rec.igzId || rec.id,
      employee: rec.employeeName || '',
      location: rec.location || '',
      craft: rec.craft || '',
      date: rec.date || '',
      businessUnit: rec.businessUnit || '',
      group: rec.group || '',
      hoursOnDuty: rec.hoursOnDuty || '',
      jhaDisc: listToString(rec.jhaDisc),
      permitDisc: listToString(rec.permitDisc),
      supervisionIssues: listToString(rec.supervisionIssues),
      shortcuts: listToString(rec.shortcuts),
      complicitBehaviors: listToString(rec.complicitBehaviors),
      unsafeConditions: listToString(rec.unsafeConditions),
      unsafeActs: listToString(rec.unsafeActs),
      ppeDetails: listToString(rec.ppeDetails),
      envConditions: listToString(rec.envConditions),
      prevActions: listToString(rec.prevActions),
      initialComments: rec.initialComments || ''
    };

    const promptText = `
You are a professional Health, Safety, and Environment (HSE) incident analyst. 
You are performing a Root Cause Analysis (RCA) report for Taurus Industrial Group (TIG). 
Do NOT refer to "Turnaround Tech Service" in the outputs, use "Taurus Industrial Group" or "TIG" instead.

Incident Description:
${rec.description || ''}

Supervisor Investigation Report Metadata:
${JSON.stringify(metadataContext, null, 2)}

Provide the Root Cause Analysis (RCA) in JSON format matching this EXACT schema:
{
  "primaryCause": "Select exactly one of the 9 standard causes (Inadequate Preparation and Planning, Equipment or Resource Failure, Fatigue, Procedural Non-Compliance, Pressure and Shortcuts, Knowledge Gaps, Environmental Interference, Complacency, Deliberate Violation)",
  "contributingFactors": "Sentence explaining key contributing factors",
  "analysisSummary": "Detailed paragraph explaining JSA/permit discrepancies, supervisory lapses, shortcuts, and complicit peer behaviors.",
  "ruledOut": {
    "prep": "Detailed explanation of why Inadequate Preparation and Planning was or was not the primary cause",
    "equip": "Detailed explanation for Equipment or Resource Failure",
    "fatigue": "Detailed explanation for Fatigue",
    "shortcuts": "Detailed explanation for Pressure and Shortcuts",
    "knowledge": "Detailed explanation for Knowledge Gaps",
    "env": "Detailed explanation for Environmental Interference",
    "complacency": "Detailed explanation for Complacency",
    "deliberate": "Detailed explanation for Deliberate Violation"
  },
  "drivingOutcome": {
    "docJsa": "Yes/No",
    "docProcedures": "Yes/No",
    "docNotes": "Detailed review of Job Safety Analysis (JSA) or permit compliance and documentation details",
    "toolsOrder": "Yes/No/N/A",
    "toolsPpe": "Yes/No",
    "toolsNotes": "Footwear condition, boots issues details",
    "supPresent": "Yes/No",
    "supIntervention": "Yes/No",
    "supNotes": "Supervisor presence/lapse details",
    "knTrained": "Yes/No",
    "knHazardComm": "Yes/No",
    "knNotes": "Knowledge or communication gaps",
    "compFollowed": "Yes/No",
    "compPpe": "Yes/No",
    "compNotes": "Procedural compliance details",
    "shortBypassed": "Yes/No",
    "shortPressure": "Yes/No",
    "shortNotes": "Bypassing safety measures, time pressure",
    "envContributed": "Yes/No",
    "envUnforeseen": "Yes/No",
    "envNotes": "Rain, algae, walking surface details"
  },
  "conclusion": "Paragraph summarizing root cause, contributing factors, and mechanism.",
  "correctiveActions": [
    { "title": "Corrective Action 1 Title", "desc": "Detailed description of action (link to SWP-033, SWP-047 if appropriate)", "responsible": "Safety Manager or Supervisor Name", "dueDate": "YYYY-MM-DD" },
    { "title": "Corrective Action 2 Title", "desc": "Detailed description...", "responsible": "Site Supervisor", "dueDate": "YYYY-MM-DD" },
    { "title": "Corrective Action 3 Title", "desc": "Detailed description...", "responsible": "Project Manager", "dueDate": "YYYY-MM-DD" },
    { "title": "Corrective Action 4 Title", "desc": "Detailed description...", "responsible": "Owner/Safety Rep", "dueDate": "YYYY-MM-DD" }
  ],
  "procedureViolations": {
    "swp33": "Violations of SWP-033 JSA policies.",
    "swp47": "Violations of SWP-047 PPE policies.",
    "other": "Supervision or peer intervention policy violations."
  },
  "additionalNotes": "Additional investigation comments."
}
`;
    return promptText;
  }

  // Retry helper for 429 rate limiting
  async function fetchWithRetry(fetchFn, maxRetries = 5) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const response = await fetchFn();
      if (response.status === 429) {
        const waitSec = Math.pow(2, attempt + 1) + Math.random() * 2;
        console.warn(`Rate limited (429). Retrying in ${waitSec.toFixed(1)}s... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, waitSec * 1000));
        continue;
      }
      return response;
    }
    throw new Error('Rate limited by Gemini API after multiple retries. Please wait a minute and try again.');
  }

  async function fetchAIAnalysis(promptText, maxRetries = 5) {
    const model = "gemini-3.5-flash";
    const isLocal = window.location.protocol === "file:" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const useProxy = !isLocal;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let response;

      if (useProxy) {
        response = await fetch("/api/gemini-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, contents: [{ parts: [{ text: promptText }] }] })
        });
      } else {
        const key = localStorage.getItem("gemini_api_key") || localStorage.getItem("geminiApiKey") || localStorage.getItem("tig_gemini_key") || "";
        if (!key) throw new Error("Gemini API Key is missing.");
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
        });
      }

      if (response.status === 429 && attempt < maxRetries) {
        const waitSec = Math.pow(2, attempt + 1) + Math.random() * 2;
        console.warn(`Rate limited (429). Retrying in ${waitSec.toFixed(1)}s... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, waitSec * 1000));
        continue;
      }

      if (!response.ok) {
        throw new Error(`API error ${response.status}`);
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error("Empty response received from Gemini.");

      const cleanJSON = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
      return JSON.parse(cleanJSON);
    }
    throw new Error('Rate limited by Gemini API after multiple retries. Wait a minute and try again.');
  }

  async function startBulkAnalysis() {
    // Find all records that are not completed (Pending Analysis or Draft)
    const pendingRecords = rcaRecords.filter(r => r.status !== 'Completed');
    
    if (pendingRecords.length === 0) {
      showToast("No pending incident records found in the registry to analyze.", "info");
      return;
    }

    if (!confirm(`Are you sure you want to run Bulk AI Analysis on all ${pendingRecords.length} pending incident(s)? This will process them sequentially.`)) {
      return;
    }

    // Reset cancel flag
    bulkCancelRequested = false;

    // Show Progress Modal
    const modal = document.getElementById('bulk-modal-overlay');
    const progressText = document.getElementById('bulk-progress-text');
    const currentIncidentText = document.getElementById('bulk-current-incident');
    const progressFill = document.getElementById('bulk-progress-bar-fill');

    if (modal) modal.classList.remove('hidden');
    
    let processedCount = 0;
    let successCount = 0;
    const total = pendingRecords.length;

    for (let i = 0; i < total; i++) {
      if (bulkCancelRequested) {
        showToast("Bulk analysis canceled by user. Saving completed records.", "warning");
        break;
      }

      const rec = pendingRecords[i];
      processedCount++;

      // Update Modal UI
      if (progressText) progressText.innerText = `Analyzing incident ${processedCount} of ${total}...`;
      if (currentIncidentText) currentIncidentText.innerText = `${rec.id} (${rec.employeeName || 'Unknown Employee'})`;
      if (progressFill) progressFill.style.width = `${(processedCount / total) * 100}%`;

      try {
        // Compile prompt text for this specific record
        const promptText = compilePromptForRecord(rec);

        // Fetch analysis from API
        const analysisData = await fetchAIAnalysis(promptText);

        if (analysisData) {
          // Map to record
          rec.status = 'Completed';
          rec.primaryCause = analysisData.primaryCause || 'Procedural Non-Compliance';
          rec.analysisSummary = analysisData.analysisSummary || '';
          rec.conclusion = analysisData.conclusion || '';
          rec.jhaDisc = analysisData.jhaDisc || rec.jhaDisc || [];
          rec.permitDisc = analysisData.permitDisc || rec.permitDisc || [];
          rec.supervisionIssues = analysisData.supervisionIssues || rec.supervisionIssues || [];
          rec.shortcuts = analysisData.shortcuts || rec.shortcuts || [];
          rec.complicitBehaviors = analysisData.complicitBehaviors || rec.complicitBehaviors || [];
          rec.unsafeConditions = analysisData.unsafeConditions || rec.unsafeConditions || [];
          rec.unsafeActs = analysisData.unsafeActs || rec.unsafeActs || [];
          rec.bodyInjured = analysisData.bodyInjured || rec.bodyInjured || [];
          rec.natureInjury = analysisData.natureInjury || rec.natureInjury || [];
          rec.ppeDetails = analysisData.ppeDetails || rec.ppeDetails || [];
          rec.incidentType = analysisData.incidentType || rec.incidentType || [];
          rec.initialComments = analysisData.initialComments || rec.initialComments || '';
          rec.investigationTeam = analysisData.investigationTeam || rec.investigationTeam || [];
          rec.prevActions = analysisData.prevActions || rec.prevActions || [];
          rec.fiveWhys = analysisData.fiveWhys || [];
          rec.ktAnalysis = analysisData.ktAnalysis || {};
          rec.pareto = analysisData.pareto || { compliance: 40, ppe: 25, supervision: 15, complicity: 10, env: 10 };
          rec.procedureViolations = analysisData.procedureViolations || {};
          rec.correctiveActions = analysisData.correctiveActions || [];
          
          // Save incrementally to prevent losing progress if cancelled or rate-limited
          await saveRecordAndSync(rec);
          successCount++;
        }
      } catch (err) {
        console.error(`Bulk AI failure for ${rec.id}:`, err);
        // Continue loop even if one fails
      }

      // Add delay to respect API rate limits (Gemini free tier: ~15 RPM)
      await new Promise(resolve => setTimeout(resolve, 4000));
    }

    // Finish
    if (modal) modal.classList.add('hidden');
    renderRegistry();
    renderParetoSummaryChart();
    renderSeverityDistributionChart();

    showToast(`Bulk AI analysis finished! Successfully completed ${successCount} out of ${total} incident(s).`, "success");
  }

  function cancelBulkAnalysis() {
    bulkCancelRequested = true;
    showToast("Canceling batch, wrapping up current request...", "loading");
  }

  // --- Predictive Risk Scoring & Dashboard ---
  
  function getSeverityPoints(designation) {
    if (!designation) return 1;
    const d = designation.toLowerCase();
    if (d.includes('fatality')) return 10;
    if (d.includes('lost workday')) return 8;
    if (d.includes('restricted') || d.includes('medical') || d.includes('recordable')) return 6;
    if (d.includes('equipment') || d.includes('damage') || d.includes('property')) return 4;
    if (d.includes('first aid') || d.includes('violation')) return 2;
    if (d.includes('near miss') || d.includes('report only') || d.includes('report-only')) return 1;
    return 3;
  }

  function getRecencyPoints(dateStr) {
    if (!dateStr) return 0;
    const incidentDate = new Date(dateStr);
    const today = new Date();
    const diffTime = today - incidentDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (isNaN(diffDays) || diffDays < 0) return 10;
    if (diffDays <= 30) return 10;
    if (diffDays <= 90) return 7;
    if (diffDays <= 180) return 4;
    if (diffDays <= 365) return 2;
    return 1;
  }

  function getFrequencyPoints(count) {
    if (count >= 5) return 10;
    if (count >= 3) return 7;
    if (count >= 2) return 4;
    if (count >= 1) return 2;
    return 0;
  }

  function getDaysSince(dateStr) {
    if (!dateStr) return 'N/A';
    const incidentDate = new Date(dateStr);
    const today = new Date();
    const diffTime = today - incidentDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (isNaN(diffDays)) return 'N/A';
    if (diffDays < 0) return '0 days ago';
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays} days ago`;
  }

  function getRiskBadgeClass(score) {
    if (score >= 8.0) return 'critical';
    if (score >= 6.0) return 'high';
    if (score >= 4.0) return 'medium';
    return 'low';
  }

  function renderPredictiveRiskDashboard() {
    const locations = {};
    const crafts = {};
    const supervisors = {};

    rcaRecords.forEach(rec => {
      const loc = rec.location ? rec.location.trim() : 'Unknown Location';
      const crf = rec.craft ? rec.craft.trim() : 'Unknown Craft';
      const sup = rec.supervisor ? rec.supervisor.trim() : 'Unknown Supervisor';
      
      const sev = getSeverityPoints(rec.designation || rec.incidentDesignation);
      const recency = getRecencyPoints(rec.date);
      const days = rec.date ? new Date(rec.date) : null;

      if (!locations[loc]) locations[loc] = { name: loc, incidents: [] };
      locations[loc].incidents.push({ date: days, dateStr: rec.date, severity: sev });

      if (!crafts[crf]) crafts[crf] = { name: crf, incidents: [] };
      crafts[crf].incidents.push({ date: days, dateStr: rec.date, severity: sev });

      if (!supervisors[sup]) supervisors[sup] = { name: sup, incidents: [] };
      supervisors[sup].incidents.push({ date: days, dateStr: rec.date, severity: sev });
    });

    const computeMetrics = (group) => {
      const count = group.incidents.length;
      let maxSev = 1;
      let latestDate = null;
      let latestDateStr = '';

      group.incidents.forEach(inc => {
        if (inc.severity > maxSev) maxSev = inc.severity;
        if (inc.date) {
          if (!latestDate || inc.date > latestDate) {
            latestDate = inc.date;
            latestDateStr = inc.dateStr;
          }
        }
      });

      const freqPts = getFrequencyPoints(count);
      const recPts = getRecencyPoints(latestDateStr);
      const sevPts = maxSev;

      const score = (2.5 * freqPts + 3.5 * recPts + 4.0 * sevPts) / 10.0;
      
      let isRising = false;
      if (latestDate) {
        const diff = new Date() - latestDate;
        const diffDays = Math.ceil(diff / (1000 * 60 * 60 * 24));
        if (diffDays <= 14 && diffDays >= 0) {
          isRising = true;
        }
      }

      return {
        name: group.name,
        score: parseFloat(score.toFixed(1)),
        count: count,
        daysStr: getDaysSince(latestDateStr),
        maxSev: maxSev,
        isRising: isRising
      };
    };

    const locationList = Object.values(locations).map(computeMetrics).sort((a, b) => b.score - a.score);
    const craftList = Object.values(crafts).map(computeMetrics).sort((a, b) => b.score - a.score);
    const supervisorList = Object.values(supervisors).map(computeMetrics).sort((a, b) => b.score - a.score);

    lastLocationList = locationList;
    lastCraftList = craftList;
    lastSupervisorList = supervisorList;

    const renderListHTML = (list, containerId) => {
      const container = document.getElementById(containerId);
      if (!container) return;
      
      if (list.length === 0) {
        container.innerHTML = `<div style="color:var(--text-muted); font-size:13px; text-align:center; padding:20px;">No incident data available.</div>`;
        return;
      }

      container.innerHTML = list.slice(0, 8).map((item, idx) => {
        const badgeClass = getRiskBadgeClass(item.score);
        const trendIcon = item.isRising ? 'trending-up' : 'minus';
        const trendClass = item.isRising ? 'rising' : 'stable';
        const trendTitle = item.isRising ? 'Rising Risk (Incident in last 14 days)' : 'Stable Risk';
        let barColor = '#10b981';
        if (badgeClass === 'critical') barColor = '#ef4444';
        else if (badgeClass === 'high') barColor = '#f97316';
        else if (badgeClass === 'medium') barColor = '#f59e0b';

        return `
          <div class="risk-row" style="flex-direction: column; align-items: stretch; gap: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <div class="risk-row-left">
                <div class="risk-rank">${idx + 1}</div>
                <div class="risk-name-block">
                  <span class="risk-name">${item.name}</span>
                  <span class="risk-details">${item.count} Incident(s) • Last: ${item.daysStr}</span>
                </div>
              </div>
              <div class="risk-row-right" style="gap: 8px;">
                <span class="risk-badge ${badgeClass}">${item.score.toFixed(1)}</span>
                <div class="risk-trend-icon ${trendClass}" title="${trendTitle}">
                  <i data-lucide="${trendIcon}" style="width:14px; height:14px;"></i>
                </div>
              </div>
            </div>
            <!-- Score Visualizer Bar -->
            <div style="width: 100%; height: 5px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; margin-left: 28px; width: calc(100% - 28px);">
              <div style="width: ${item.score * 10}%; height: 100%; background: ${barColor}; border-radius: 3px; transition: width 0.6s ease-in-out;"></div>
            </div>
          </div>
        `;
      }).join('');
    };

    renderListHTML(locationList, 'risk-location-list');
    renderListHTML(craftList, 'risk-craft-list');
    renderListHTML(supervisorList, 'risk-supervisor-list');

    const actionsContainer = document.getElementById('risk-proactive-actions');
    if (actionsContainer) {
      const actionItems = [];

      locationList.slice(0, 2).forEach(item => {
        if (item.score >= 6.0) {
          actionItems.push({
            title: `Safety Stand-Down & JSA Audit at ${item.name}`,
            desc: `This location has a high risk rating of ${item.score.toFixed(1)} due to recent or highly severe incidents. Recommend holding an immediate site safety stand-down within 48 hours to review JSA compliance (SWP-033).`,
            icon: 'map-pin'
          });
        }
      });

      craftList.slice(0, 2).forEach(item => {
        if (item.score >= 6.0) {
          actionItems.push({
            title: `PPE & Safe Work Practice Inspection for ${item.name} Crews`,
            desc: `The ${item.name} craft carries an elevated risk score of ${item.score.toFixed(1)}. Coordinate with field supervisors to perform unannounced audits of crew PPE (including slip-resistant footwear compliance under SWP-047) and tools preparation.`,
            icon: 'wrench'
          });
        }
      });

      supervisorList.slice(0, 2).forEach(item => {
        if (item.score >= 6.0) {
          actionItems.push({
            title: `HSE Support & JSA Quality Coaching for ${item.name}`,
            desc: `Crews led by supervisor ${item.name} are ranked at elevated risk (${item.score.toFixed(1)}). Recommend an HSE representative join their next morning tool-box talk to provide hands-on training for JSA hazard mitigation and peer warning rules.`,
            icon: 'users'
          });
        }
      });

      if (actionItems.length === 0) {
        actionsContainer.innerHTML = `
          <div class="proactive-action-card" style="border-color: rgba(16, 185, 129, 0.1); background: rgba(16, 185, 129, 0.01);">
            <div class="proactive-action-icon" style="color: #10b981;">
              <i data-lucide="shield-check" style="width:20px; height:20px;"></i>
            </div>
            <div class="proactive-action-content">
              <h4>All Safety Metrics Stable</h4>
              <p>No jobsites, crafts, or supervisors exceed the warning threshold. Continue standard JSA audits, routine field safety walk-throughs, and peer interventions.</p>
            </div>
          </div>
        `;
      } else {
        actionsContainer.innerHTML = actionItems.map(item => `
          <div class="proactive-action-card">
            <div class="proactive-action-icon">
              <i data-lucide="${item.icon}" style="width:20px; height:20px;"></i>
            </div>
            <div class="proactive-action-content">
              <h4>${item.title}</h4>
              <p>${item.desc}</p>
            </div>
          </div>
        `).join('');
      }
    }

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function printRiskExecutiveSummary() {
    const actionItems = [];
    
    lastLocationList.slice(0, 2).forEach(item => {
      if (item.score >= 6.0) {
        actionItems.push({
          title: `Safety Stand-Down & JSA Audit at ${item.name}`,
          desc: `This location has a high risk rating of ${item.score.toFixed(1)} due to recent or highly severe incidents. Recommend holding an immediate site safety stand-down within 48 hours to review JSA compliance (SWP-033).`
        });
      }
    });

    lastCraftList.slice(0, 2).forEach(item => {
      if (item.score >= 6.0) {
        actionItems.push({
          title: `PPE & Safe Work Practice Inspection for ${item.name} Crews`,
          desc: `The ${item.name} craft carries an elevated risk score of ${item.score.toFixed(1)}. Coordinate with field supervisors to perform unannounced audits of crew PPE (including slip-resistant footwear compliance under SWP-047) and tools preparation.`
        });
      }
    });

    lastSupervisorList.slice(0, 2).forEach(item => {
      if (item.score >= 6.0) {
        actionItems.push({
          title: `HSE Support & JSA Quality Coaching for ${item.name}`,
          desc: `Crews led by supervisor ${item.name} are ranked at elevated risk (${item.score.toFixed(1)}). Recommend an HSE representative join their next morning tool-box talk to provide hands-on training for JSA hazard mitigation and peer warning rules.`
        });
      }
    });

    const printWin = window.open('', '_blank');
    if (!printWin) {
      showToast("Pop-up blocked! Please enable pop-ups to print the report.", "error");
      return;
    }

    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Executive Safety Risk Forecasting Summary</title>
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #1e293b;
      background: #ffffff;
      padding: 40px;
      line-height: 1.5;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .print-header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 16px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .print-logo {
      font-weight: 800;
      font-size: 20px;
      letter-spacing: 0.5px;
      color: #0f172a;
      text-transform: uppercase;
    }
    .print-logo span {
      font-weight: 300;
      color: #64748b;
      display: block;
      font-size: 11px;
      letter-spacing: 1px;
    }
    .print-title {
      text-align: right;
    }
    .print-title h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .print-title p {
      margin: 4px 0 0 0;
      font-size: 10px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      background: #f8fafc;
      padding: 16px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      margin-bottom: 24px;
    }
    .meta-item {
      font-size: 12px;
    }
    .meta-lbl {
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
      font-size: 10px;
      margin-bottom: 4px;
    }
    .meta-val {
      font-weight: 700;
      color: #0f172a;
    }
    .section-title {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
      text-transform: uppercase;
      border-bottom: 1.5px solid #cbd5e1;
      padding-bottom: 6px;
      margin-top: 24px;
      margin-bottom: 12px;
      letter-spacing: 0.5px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-bottom: 24px;
    }
    .summary-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      background: #ffffff;
    }
    .card-hdr {
      font-size: 11px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 12px;
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 8px;
      display: flex;
      justify-content: space-between;
    }
    .item-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px dashed #f1f5f9;
      font-size: 11px;
    }
    .item-row:last-child {
      border-bottom: none;
    }
    .item-name {
      font-weight: 700;
      color: #334155;
    }
    .item-meta {
      color: #64748b;
      font-size: 10px;
      margin-top: 2px;
    }
    .score-badge {
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      min-width: 24px;
      text-align: center;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .score-critical { background: #fee2e2; color: #ef4444; }
    .score-high { background: #ffedd5; color: #f97316; }
    .score-medium { background: #fef9c3; color: #ca8a04; }
    .score-low { background: #dcfce7; color: #16a34a; }
    
    .actions-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .action-box {
      border-left: 3px solid #0ea5e9;
      background: #f8fafc;
      padding: 12px 16px;
      border-radius: 0 8px 8px 0;
      font-size: 11px;
    }
    .action-title {
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .action-desc {
      color: #475569;
      line-height: 1.4;
    }
    .sig-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-top: 50px;
      border-top: 1px solid #e2e8f0;
      padding-top: 24px;
      font-size: 11px;
    }
    .sig-line {
      border-top: 1px dashed #94a3b8;
      margin-top: 32px;
      padding-top: 4px;
      text-align: center;
      color: #64748b;
      font-weight: 600;
    }
    @media print {
      body {
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="print-header">
    <div class="print-logo">
      TAURUS
      <span>INDUSTRIAL GROUP</span>
    </div>
    <div class="print-title">
      <h2>Safety Risk Forecasting Summary</h2>
      <p>EXECUTIVE SAFETY REPORT - GENERATED WEEKLY</p>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-item">
      <div class="meta-lbl">Date Generated</div>
      <div class="meta-val">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
    </div>
    <div class="meta-item">
      <div class="meta-lbl">Total Incidents Analyzed</div>
      <div class="meta-val">${rcaRecords.length} Records</div>
    </div>
    <div class="meta-item">
      <div class="meta-lbl">Top Risk Location</div>
      <div class="meta-val">${lastLocationList[0]?.name || 'N/A'} (${lastLocationList[0]?.score.toFixed(1)})</div>
    </div>
    <div class="meta-item">
      <div class="meta-lbl">Status</div>
      <div class="meta-val" style="color:#16a34a">ACTIVE FORECAST</div>
    </div>
  </div>

  <div class="section-title">1. High-Exposure Safety Risk Indices</div>
  <div class="summary-grid">
    <!-- Locations Card -->
    <div class="summary-card">
      <div class="card-hdr">
        <span>TOP LOCATIONS AT RISK</span>
        <span>SCORE</span>
      </div>
      ${lastLocationList.slice(0, 5).map((item, idx) => `
        <div class="item-row">
          <div>
            <div class="item-name">${idx + 1}. ${item.name}</div>
            <div class="item-meta">${item.count} incident(s) • Last: ${item.daysStr}</div>
          </div>
          <span class="score-badge score-${getRiskBadgeClass(item.score)}">${item.score.toFixed(1)}</span>
        </div>
      `).join('')}
    </div>

    <!-- Crafts Card -->
    <div class="summary-card">
      <div class="card-hdr">
        <span>TOP CRAFTS AT RISK</span>
        <span>SCORE</span>
      </div>
      ${lastCraftList.slice(0, 5).map((item, idx) => `
        <div class="item-row">
          <div>
            <div class="item-name">${idx + 1}. ${item.name}</div>
            <div class="item-meta">${item.count} incident(s) • Last: ${item.daysStr}</div>
          </div>
          <span class="score-badge score-${getRiskBadgeClass(item.score)}">${item.score.toFixed(1)}</span>
        </div>
      `).join('')}
    </div>

    <!-- Supervisors Card -->
    <div class="summary-card">
      <div class="card-hdr">
        <span>TOP SUPERVISORS AT RISK</span>
        <span>SCORE</span>
      </div>
      ${lastSupervisorList.slice(0, 5).map((item, idx) => `
        <div class="item-row">
          <div>
            <div class="item-name">${idx + 1}. ${item.name}</div>
            <div class="item-meta">${item.count} incident(s) • Last: ${item.daysStr}</div>
          </div>
          <span class="score-badge score-${getRiskBadgeClass(item.score)}">${item.score.toFixed(1)}</span>
        </div>
      `).join('')}
    </div>
  </div>

  <div class="section-title">2. Proactive Actions & Prevention Recommendations</div>
  <div class="actions-list">
    ${actionItems.length > 0 ? actionItems.map(item => `
      <div class="action-box">
        <div class="action-title">${item.title}</div>
        <div class="action-desc">${item.desc}</div>
      </div>
    `).join('') : '<div class="action-box" style="border-left-color:#cbd5e1;color:#64748b;">No high-risk actions flagged. All metrics within standard operating bounds.</div>'}
  </div>

  <div class="sig-row">
    <div>
      <div class="sig-line">Prepared By: Safety Director</div>
    </div>
    <div>
      <div class="sig-line">Approved By: Operations & Quality Manager</div>
    </div>
  </div>
</body>
</html>
    `;

    printWin.document.write(html);
    printWin.document.close();
    
    printWin.focus();
    setTimeout(() => {
      printWin.print();
    }, 500);
  }

  function renderMaximizedParetoChart() {
    const canvas = document.getElementById('maximized-pareto-chart');
    if (!canvas) return;

    const freq = {};
    ROOT_CAUSES.forEach(c => freq[c] = 0);
    
    rcaRecords.forEach(r => {
      if (r.status === 'Completed' && r.primaryCause) {
        freq[r.primaryCause] = (freq[r.primaryCause] || 0) + 1;
      }
    });

    const sortedCauses = Object.keys(freq)
      .map(c => ({ cause: c, count: freq[c] }))
      .sort((a, b) => b.count - a.count);

    const labels = sortedCauses.map(s => s.cause);
    const counts = sortedCauses.map(s => s.count);

    const total = counts.reduce((a, b) => a + b, 0);
    let cumulative = 0;
    const cumulativePercent = counts.map(c => {
      if (total === 0) return 0;
      cumulative += c;
      return parseFloat(((cumulative / total) * 100).toFixed(1));
    });

    if (maximizedChart) {
      maximizedChart.destroy();
    }

    maximizedChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Incident Count',
            data: counts,
            backgroundColor: '#0ea5e9',
            borderColor: '#0284c7',
            borderWidth: 1.5,
            yAxisID: 'y'
          },
          {
            label: 'Cumulative %',
            data: cumulativePercent,
            type: 'line',
            borderColor: '#f97316',
            backgroundColor: 'rgba(249, 115, 22, 0.1)',
            borderWidth: 2,
            pointBackgroundColor: '#f97316',
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: '#94a3b8',
              font: { family: 'Jost', size: 12 }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(148, 163, 184, 0.05)' },
            ticks: { 
              color: '#94a3b8', 
              font: { family: 'Jost', size: 10, weight: '500' },
              maxRotation: 45,
              minRotation: 15
            }
          },
          y: {
            grid: { color: 'rgba(148, 163, 184, 0.05)' },
            ticks: { color: '#94a3b8', stepSize: 1, font: { family: 'Jost', size: 10 } },
            title: { display: true, text: 'Frequency', color: '#64748b', font: { family: 'Jost', size: 12, weight: '700' } }
          },
          y1: {
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { color: '#94a3b8', font: { family: 'Jost', size: 10 }, callback: value => `${value}%` },
            max: 100,
            min: 0,
            title: { display: true, text: 'Cumulative Percent', color: '#64748b', font: { family: 'Jost', size: 12, weight: '700' } }
          }
        }
      }
    });
  }


  // --- User Management (Admin Only) ---
  async function openUserManagement() {
    document.getElementById('user-mgmt-overlay').classList.remove('hidden');
    await renderUserTable();
    if (window.lucide) window.lucide.createIcons();
  }

  async function renderUserTable() {
    const tbody = document.getElementById('user-mgmt-table-body');
    if (!tbody || !window.loadUsers) return;
    try {
      const users = await window.loadUsers();
      tbody.innerHTML = users.map(u => `
        <tr style="border-bottom: 1px solid rgba(148,163,184,0.08);">
          <td style="padding: 10px 12px; font-size: 13px; color: #fff;">${u.displayName || '—'}</td>
          <td style="padding: 10px 12px; font-size: 13px; color: var(--text-secondary);">${u.email}</td>
          <td style="padding: 10px 12px;">
            <select data-uid="${u.uid}" class="role-select" style="padding: 4px 8px; background: rgba(15,23,42,0.8); border: 1px solid rgba(148,163,184,0.15); border-radius: 4px; color: #fff; font-size: 12px;">
              <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
              <option value="investigator" ${u.role === 'investigator' ? 'selected' : ''}>Investigator</option>
              <option value="viewer" ${u.role === 'viewer' ? 'selected' : ''}>Viewer</option>
            </select>
          </td>
          <td style="padding: 10px 12px; text-align: right;">
            <button class="btn-action-icon" data-uid="${u.uid}" data-action="delete" title="Remove user" style="width: 26px; height: 26px; background: transparent; border: 1px solid rgba(239,68,68,0.3); border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;">
              <i data-lucide="trash-2" style="width: 14px; height: 14px; color: #ef4444;"></i>
            </button>
          </td>
        </tr>
      `).join('');

      // Role change listeners
      tbody.querySelectorAll('.role-select').forEach(sel => {
        sel.addEventListener('change', async (e) => {
          try {
            await window.updateUserRole(e.target.dataset.uid, e.target.value);
            showToast('Role updated', 'success');
          } catch (err) {
            showToast('Error: ' + err.message, 'error');
          }
        });
      });

      // Delete listeners
      tbody.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Remove this user profile? (They will no longer be able to access the app.)')) return;
          try {
            await window.deleteUserProfile(btn.dataset.uid);
            showToast('User removed', 'success');
            await renderUserTable();
            if (window.lucide) window.lucide.createIcons();
          } catch (err) {
            showToast('Error: ' + err.message, 'error');
          }
        });
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="4" style="padding: 16px; color: var(--text-muted); text-align: center;">Error loading users</td></tr>`;
    }
  }

  async function handleAddUser() {
    const name = document.getElementById('new-user-name').value.trim();
    const email = document.getElementById('new-user-email').value.trim();
    const password = document.getElementById('new-user-password').value;
    const role = document.getElementById('new-user-role').value;

    if (!name || !email || !password) {
      showToast('Please fill in name, email, and password', 'error');
      return;
    }
    if (password.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }

    try {
      await window.createUserAccount(email, password, name, role);
      showToast(`User ${name} created as ${role}`, 'success');
      document.getElementById('new-user-name').value = '';
      document.getElementById('new-user-email').value = '';
      document.getElementById('new-user-password').value = '';
      await renderUserTable();
      if (window.lucide) window.lucide.createIcons();
      // Refresh assigned-to dropdown
      if (window.getUsersList) {
        const users = await window.getUsersList();
        const sel = document.getElementById('f-assigned-to');
        if (sel) {
          sel.innerHTML = '<option value="">— Unassigned —</option>';
          users.forEach(u => {
            sel.innerHTML += `<option value="${u.email}">${u.displayName || u.email}</option>`;
          });
        }
      }
    } catch (e) {
      showToast('Error creating user: ' + e.message, 'error');
    }
  }

  // initApp() is now called by firebase-config.js after auth state is confirmed
  window.initApp = initApp;
});
