require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');

const PORT = Number(process.env.PORT) || 5000;
const SHEET_ID = process.env.GOOGLE_SHEET_ID|| '1WwkQVM4O_66Ag3hvIJ5IYJ7C9x51dp1ig0oB1nh65xo';
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Login_NhutPT';
const SERVICE_ACCOUNT_B64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64 || 'ewogICJ0eXBlIjogInNlcnZpY2VfYWNjb3VudCIsCiAgInByb2plY3RfaWQiOiAiYXV0b2xvZ2luLTQ3NjAxMCIsCiAgInByaXZhdGVfa2V5X2lkIjogImI4ZDg1YzE2ZjBlZDM3ZDdlMzdlNTQ4YmMzZDE5MThmZGM2MDBlMjkiLAogICJwcml2YXRlX2tleSI6ICItLS0tLUJFR0lOIFBSSVZBVEUgS0VZLS0tLS1cbk1JSUV2UUlCQURBTkJna3Foa2lHOXcwQkFRRUZBQVNDQktjd2dnU2pBZ0VBQW9JQkFRQ1V6WWJMZUQ5Uk14dmtcbkVtSkIyYnFPbDNGS05zUTNqaHVucXI0M3dFVGRlS1hkMDJjaGk4RHZWNmh5NmkyMEQvRGcyRTQzVXJ3ZE91aXhcbis2MUFzekRtcDNrdmhmOXN1VEgxSCtkalBVVW85b0sxQndsVkEvVkRFQkpQelcxaE1ZSm5hdWpvWEVCejlscDZcbk9JQXhDSitrdVBWRU9yNTBIK2hNYUd0NFNqL2dyWHQ1N0hUYXh1TXM0ck1DV2ltejFId01SaGlWWjJLNTlZTGhcbitWWFZWaGtEdzJTaHpMalpoSDF1NVhBeXRzbVZPbEREdlpKRFQ4UmlseU9OSFU2NUhET2xtZTZCVWx5WU02NmxcbmxBVTMvcngwUFkxQ3RuYWM3eEwyMWR2TStnZEFKb1VudEo2QzFmMFAxOEx1UVZDOUxydERXN3RxenF6RkdraUJcbjM3V3hjcmE5QWdNQkFBRUNnZ0VBQ3Nnc1M0aWcvZDg0TENSdzNpMzFQZWtYUlF0Y0xiSlcvL3AzNGZqdjJjNytcbkpiNmJBR3ZzbWtCb2JPWFpxSmNSeGNPbWx6ZWdJeUM3bWs4NWZ6Q25ZRzhqY1hWc3krZE10QTJRYWVQQitSL2Vcbkwxa2RMS2g4R0ZTTkh4OHNIUmpGOFh4bVRUL2NvN1VSV3BNY0pzYTdMK2Vwb3p5bWJ0VHpzMldnTStKeXZSMTRcbmw1ejBoVS8xVFJnVXJBWStvWERJV0VYVFB2bUkwN3V2NC9pcjhsYThmSVRmY3loRmtVM0oxTW9NSllSMmgrU21cbktrOFI1d0hCZEJGcGxGWHhpVjdENjFzOGlEVjdGd2N1NlppUis5bkVOelUrN2dYQisrMTc4OU9JMXVlMXhVTmxcbjEvSHoyWnR4RmRzdFZwREpYUExhRzE5dmQwaHRCZnRVT0JPNkM1cDBRUUtCZ1FESnBxSUpoSnROY2VRcFBiSkdcbks2dE9GTXJQd3FSQy9yUUp0Qk1IOSs4M2RnejhUelZKNDBuU09EMW00QjRDVXVZdGducS9ld1JJY28vL1AzUnVcbm9oNE8xdFVzOFphbnFOdDUwVnk3TkVET0VieGFZVHQ5WVp4SGFpbndUMGg5MzdEcndENlJRa2JKV2Z4T1NTR05cbmRlcmhpTUx2M3VSZzN1bmdmakIwaDRidnFRS0JnUUM4NklVSHNsM0NodGZGaDlUK2Q4U1labGpZRXBYWnNDaVdcbldGQjVud0ppY0RSWHQzMW82UzZJSkJUOTRaclRCemM5SnVMc25ucXZNb3E4b1ZwL1RnQWZjakpxTDN4R1VnVlZcbkJtcDlmbXNXQzcwam5CMStWWTFpTmZubzEvc2E2cnFtNnNLNC95L2FIVFRQVEtJZTUwczdzR0R2YVdzeVNibEJcbk1nT1pVeFRLOVFLQmdERHZYeU13S3dBQVEzNCttcVNzdEVXZWhoa2xBdmUvRjdIRElWc3RyNytseGtEMGQ5b1dcbmJqTzFzakRrOG1OZCtyM1FqRGtyZ1Q2VGpwNUNwOTZ4T05vaENGcC94aStwcXBsRlZWdVlzcUZQYklZQ1VvMTZcbndwSVNFVnRmNGhlcDBTVms0Y29lYTA4eHB5allWbXdkMFlJcHppU24wb1F2bEZJR1RYdjU1NlVCQW9HQURmVzBcbjF2UEVYL3FzK1VqbllZS2lRWXpXcGVrQnI5dUh0RXlFYmVobE9iY0c5ekIxRVFxaVNLYzU4ZVQ1RnYwaWhOOVpcbng1aVNnbDNleUwrM3UwNmRUYldYcWljbUxPQWt5cnExcGQ1d3RXbGFxY1lBbS9SZ2hWQnR6bG9ma1VhbFVtNW9cbncxa0FSVU1CUXd4cnNwTHZDVk1vWnFqSXBpZXlpL0hST0VSZWRmMENnWUVBaWg3OS85YTdzWnZ1enFDcVBuUWdcbm1tbWRRV2lnM05wcVNqeWdjak9Fd3pKd0pIbVIrNVF6UE5NSlY2Qlo0dDFwb0hlZkJWeVhldnRnVUpBL081Q3dcbnRuRWxHVjE0WWtrM3NGNGdPM1doNUNqV25ScldldlRGOGxHR0lDOFFZdFl1bjN4L2FwV1BIY1E2YmNhakluV29cblF4U3MvdEJnOGc4TzNjS0hnS2xWWVRVPVxuLS0tLS1FTkQgUFJJVkFURSBLRVktLS0tLVxuIiwKICAiY2xpZW50X2VtYWlsIjogIm15c2hlZXQtYm90QGF1dG9sb2dpbi00NzYwMTAuaWFtLmdzZXJ2aWNlYWNjb3VudC5jb20iLAogICJjbGllbnRfaWQiOiAiMTA2NDI4NTQyMTI3NTI5MTMwODAxIiwKICAiYXV0aF91cmkiOiAiaHR0cHM6Ly9hY2NvdW50cy5nb29nbGUuY29tL28vb2F1dGgyL2F1dGgiLAogICJ0b2tlbl91cmkiOiAiaHR0cHM6Ly9vYXV0aDIuZ29vZ2xlYXBpcy5jb20vdG9rZW4iLAogICJhdXRoX3Byb3ZpZGVyX3g1MDlfY2VydF91cmwiOiAiaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vb2F1dGgyL3YxL2NlcnRzIiwKICAiY2xpZW50X3g1MDlfY2VydF91cmwiOiAiaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vcm9ib3QvdjEvbWV0YWRhdGEveDUwOS9teXNoZWV0LWJvdCU0MGF1dG9sb2dpbi00NzYwMTAuaWFtLmdzZXJ2aWNlYWNjb3VudC5jb20iLAogICJ1bml2ZXJzZV9kb21haW4iOiAiZ29vZ2xlYXBpcy5jb20iCn0K';

const logger = {
  info: (message, meta = {}) => console.log(`[INFO] ${message}`, meta),
  warn: (message, meta = {}) => console.warn(`[WARN] ${message}`, meta),
  error: (message, meta = {}) => console.error(`[ERROR] ${message}`, meta),
};

let sheetsClientPromise = null;

function parseServiceAccount() {
  if (!SERVICE_ACCOUNT_B64) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_B64 is not set.');
  }

  try {
    const decodedJson = Buffer.from(SERVICE_ACCOUNT_B64, 'base64').toString('utf-8');
    return JSON.parse(decodedJson);
  } catch (err) {
    throw new Error('Failed to parse GOOGLE_SERVICE_ACCOUNT_B64. Ensure it is valid base64-encoded JSON.');
  }
}

async function getSheetsClient() {
  if (sheetsClientPromise) {
    return sheetsClientPromise;
  }

  sheetsClientPromise = (async () => {
    if (!SHEET_ID) {
      throw new Error('GOOGLE_SHEET_ID must be provided.');
    }

    const serviceAccount = parseServiceAccount();

    if (!serviceAccount.client_email || !serviceAccount.private_key) {
      throw new Error('Service account JSON must include client_email and private_key.');
    }

    const jwtClient = new google.auth.JWT(
      serviceAccount.client_email,
      undefined,
      serviceAccount.private_key,
      ['https://www.googleapis.com/auth/spreadsheets']
    );

    await jwtClient.authorize();
    logger.info('Google Sheets client authorized.');

    return google.sheets({ version: 'v4', auth: jwtClient });
  })();

  return sheetsClientPromise;
}

function validateCellNotation(cell) {
  return /^[A-Za-z]+[0-9]+$/.test(cell);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

function resolveSheetName(sheetName) {
  if (typeof sheetName !== 'string') {
    return SHEET_NAME;
  }

  const trimmed = sheetName.trim();
  if (!trimmed) {
    return SHEET_NAME;
  }

  if (/[!'\r\n\t]/.test(trimmed)) {
    logger.warn('Invalid sheet name provided, falling back to default.', { sheetName });
    return SHEET_NAME;
  }

  return trimmed;
}

function escapeSheetName(sheetName) {
  return sheetName.replace(/'/g, "''");
}

app.get('/sheets', async (_req, res) => {
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
      fields: 'sheets(properties(title,sheetId))',
    });

    const sheetList =
      response.data.sheets?.map(({ properties }) => ({
        id: properties?.sheetId ?? null,
        title: properties?.title ?? '',
      })) ?? [];

    res.json({
      sheets: sheetList.filter((sheet) => sheet.title.length > 0),
      defaultSheet: SHEET_NAME,
    });
  } catch (err) {
    logger.error('Error fetching sheet metadata', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.post('/sheet', async (req, res) => {
  const { action, cell, value, sheetName } = req.body || {};
  const targetSheetName = resolveSheetName(sheetName);
  logger.info('Received sheet request', { action, cell, sheetName: targetSheetName });

  if (!action) {
    return res.status(400).json({ error: 'Missing action in request body.' });
  }

  try {
    const sheets = await getSheetsClient();

    if (action === 'get-state') {
      const escapedSheet = escapeSheetName(targetSheetName);
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `'${escapedSheet}'`,
      });

      const values = response.data.values || [];
      return res.json({ values, sheetName: targetSheetName });
    }

    if (action === 'update-cell') {
      if (!cell || !validateCellNotation(cell)) {
        return res.status(400).json({ error: 'A valid cell (e.g., "A2") must be provided.' });
      }

      const requestBody = {
        values: [[value ?? '']],
      };

      const escapedSheet = escapeSheetName(targetSheetName);
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `'${escapedSheet}'!${cell}`,
        valueInputOption: 'USER_ENTERED',
        requestBody,
      });

      logger.info('Cell updated successfully', { cell, sheetName: targetSheetName });
      return res.json({ success: true, sheetName: targetSheetName });
    }

    return res.status(400).json({ error: `Unsupported action "${action}".` });
  } catch (err) {
    logger.error('Error handling sheet request', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

app.use((err, _req, res, _next) => {
  logger.error('Unhandled server error', { error: err.message });
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason });
});
