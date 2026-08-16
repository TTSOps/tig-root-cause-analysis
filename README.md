# TIG Root Cause Analysis (RCA) App

A self-contained, interactive Health, Safety, and Environment (HSE) Root Cause Analysis (RCA) tool designed matching the premium dark look and feel of the **Taurus Industrial Group (TIG)** suite of apps.

## Features

- **Incident Import:** Drag and drop or select raw investigation spreadsheets (e.g. `data (33).xlsx` from Supervisor Investigation Reports) to instantly load all incident profile metadata.
- **Gemini AI Investigation Analyst:** Automatically evaluate JSA discrepancies, unsafe conditions, and timeline descriptions to draft the 5 Whys, isolate problem boundaries (Kepner-Tregoe), allocate Pareto cause distributions, rule out alternatives, and suggest corrective actions aligned with SWPs.
- **RCA Investigation Wizard:** A structured 6-step wizard guiding safety professionals from Incident Profiling, Driving Q&As, 5 Whys, Verification Matrix (KT & Pareto), to Root Cause Determination and Corrective Action scheduling.
- **Executive PDF Report Generator:** Generate beautiful, professional, print-ready root cause analysis reports, structured to the TIG Standard.

## Deployment Guide (GitHub & Vercel)

This application is designed to be fully self-contained in this folder. You can push this folder as an independent repository to GitHub and publish it to Vercel with zero external dependencies.

### Step 1: Initialize Git and Push to GitHub

1. Open your terminal (e.g., PowerShell on Windows).
2. Navigate directly into this directory:
   ```powershell
   cd "C:\Users\Kevin\Desktop\PKM (A.I. Brain)\Root Cause Analysis App - TIG"
   ```
3. Initialize Git, stage all files, and commit:
   ```powershell
   git init
   git add .
   git commit -m "Initial commit - TIG Root Cause Analysis App"
   ```
4. Create a new repository on GitHub (e.g., named `tig-root-cause-analysis`).
5. Link and push to your new GitHub repository:
   ```powershell
   git remote add origin https://github.com/your-username/tig-root-cause-analysis.git
   git branch -M main
   git push -u origin main
   ```

### Step 2: Deploy to Vercel

1. Log into your account on [Vercel](https://vercel.com).
2. Click **Add New Project**.
3. Import the `tig-root-cause-analysis` repository from your GitHub account.
4. **Configure Environment Variables:**
   - Under **Environment Variables**, add:
     - Name: `GEMINI_API_KEY`
     - Value: *Your Google AI Studio Gemini API Key*
5. Click **Deploy**. Vercel will automatically build the static page and host the `/api/gemini-proxy.js` function.

### Local Development / Running Statically

To run the application locally, open `index.html` directly in your browser.
