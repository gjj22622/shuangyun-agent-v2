const REQUIRED_SECRET_PROPERTY = 'SHUANGYUN_WEBHOOK_SECRET';
const DEFAULT_FORM_TITLE_SUFFIX = 'AI Marketing Department';

function doPost(e) {
  try {
    assertWebhookSecret_(e);

    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_(400, { ok: false, error: 'Missing request body.' });
    }

    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;

    if (action === 'create_brand_form') {
      return jsonResponse_(200, handleCreateBrandForm_(payload));
    }

    if (action === 'write_output') {
      return jsonResponse_(200, handleWriteOutput_(payload));
    }

    if (action === 'list_feedback') {
      return jsonResponse_(200, handleListFeedback_(payload));
    }

    return jsonResponse_(400, { ok: false, error: `Unsupported action: ${String(action)}` });
  } catch (error) {
    return jsonResponse_(500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function doGet() {
  return jsonResponse_(200, {
    ok: true,
    service: 'shuangyun-google-forms-webhook'
  });
}

function handleCreateBrandForm_(requestBody) {
  const clientId = requireString_(requestBody.clientId, 'clientId');
  const payload = requestBody.payload || {};
  const brandName = requireString_(payload.brandName, 'payload.brandName');

  const folder = resolveWorkspaceFolder_();
  const formTitle = `${brandName} - ${DEFAULT_FORM_TITLE_SUFFIX}`;
  const form = FormApp.create(formTitle);
  const formFile = DriveApp.getFileById(form.getId());
  folder.addFile(formFile);
  DriveApp.getRootFolder().removeFile(formFile);

  form.setTitle(formTitle);
  form.setDescription(
    [
      `Client ID: ${clientId}`,
      `Industry: ${safeString_(payload.industry)}`,
      `Primary goal: ${safeString_(payload.primaryGoal)}`,
      `Owner: ${safeString_(payload.ownerName)} <${safeString_(payload.ownerEmail)}>`
    ].join('\n')
  );

  addTaskOutputSection_(form);
  addAssetSection_(form);
  addFeedbackSection_(form);
  addOpsSection_(form);

  const responseSheet = ensureResponseSheet_(form, folder, brandName, clientId);

  return {
    ok: true,
    googleFormUrl: form.getPublishedUrl(),
    googleSheetId: responseSheet.getId()
  };
}

function handleWriteOutput_(requestBody) {
  const sheetId = requireString_(requestBody.googleSheetId, 'googleSheetId');
  const output = requestBody.output || {};
  const spreadsheet = SpreadsheetApp.openById(sheetId);
  const sheet = ensureOutputsSheet_(spreadsheet);
  const rowIndex = sheet.getLastRow() + 1;
  const review = output.review || {};

  sheet.appendRow([
    safeString_(output.outputId),
    safeString_(output.taskId),
    safeString_(output.clientId),
    safeString_(output.type),
    safeString_(output.title),
    safeString_(output.contentBody),
    safeString_(review.verdict),
    safeString_(review.confidence),
    `${safeString_(review.bossScore)}|${safeString_(review.bossNote)}`,
    `${safeString_(review.managerScore)}|${safeString_(review.managerNote)}`,
    `${safeString_(review.windowScore)}|${safeString_(review.windowNote)}`,
    `${safeString_(review.brandScore)}|${safeString_(review.brandNote)}`,
    safeString_(output.createdAt)
  ]);

  return {
    ok: true,
    formRowId: `${sheet.getName()}!${rowIndex}`,
    sheetId,
    rowIndex
  };
}

function handleListFeedback_(requestBody) {
  const sheetId = requireString_(requestBody.googleSheetId, 'googleSheetId');
  const sinceIso = nullableString_(requestBody.sinceIso);
  const spreadsheet = SpreadsheetApp.openById(sheetId);
  const sheet = spreadsheet.getSheets()[0];
  const values = sheet.getDataRange().getValues();

  if (!values.length) {
    return { ok: true, feedbacks: [], total: 0 };
  }

  const headerMap = createHeaderMap_(values[0]);
  const feedbacks = [];

  for (var index = 1; index < values.length; index += 1) {
    const row = values[index];
    const submittedAt = normalizeTimestamp_(getCellByHeader_(row, headerMap, 'Timestamp'));
    if (sinceIso && submittedAt && submittedAt < sinceIso) {
      continue;
    }

    feedbacks.push({
      rowIndex: index + 1,
      submittedAt: submittedAt || '',
      clientId: safeString_(getCellByHeader_(row, headerMap, 'Client ID')),
      outputId: nullableString_(getCellByHeader_(row, headerMap, 'Output ID')),
      feedbackType: normalizeFeedbackType_(getCellByHeader_(row, headerMap, 'Feedback type')),
      content: safeString_(getCellByHeader_(row, headerMap, 'Feedback detail')),
      submittedBy: safeString_(getCellByHeader_(row, headerMap, 'Submitted by'))
    });
  }

  return {
    ok: true,
    feedbacks,
    total: feedbacks.length
  };
}

function addTaskOutputSection_(form) {
  form.addSectionHeaderItem().setTitle('Section 1: Task Output');
  form.addTextItem().setTitle('Task title').setRequired(true);
  form.addTextItem().setTitle('Output title').setRequired(true);
  form.addParagraphTextItem().setTitle('Content body').setRequired(true);
  form.addTextItem().setTitle('Skill used').setRequired(true);
  form.addTextItem().setTitle('Committee verdict').setRequired(true);
  form.addTextItem().setTitle('Confidence score').setRequired(true);
}

function addAssetSection_(form) {
  form.addSectionHeaderItem().setTitle('Section 2: Assets');
  form.addParagraphTextItem().setTitle('Asset URLs');
  form.addTextItem().setTitle('Drive folder URL');
  form.addTextItem().setTitle('Related task ID');
}

function addFeedbackSection_(form) {
  form.addSectionHeaderItem().setTitle('Section 3: Feedback');
  form.addMultipleChoiceItem()
    .setTitle('Feedback type')
    .setChoiceValues(['approve', 'minor_change', 'reject'])
    .setRequired(true);
  form.addParagraphTextItem().setTitle('Feedback detail').setRequired(true);
  form.addTextItem().setTitle('Submitted by');
}

function addOpsSection_(form) {
  form.addSectionHeaderItem().setTitle('Section 4: Operations');
  form.addTextItem().setTitle('Client ID').setRequired(true);
  form.addTextItem().setTitle('Output ID').setRequired(true);
  form.addTextItem().setTitle('Trace ID');
}

function ensureResponseSheet_(form, folder, brandName, clientId) {
  const spreadsheet = SpreadsheetApp.create(`${brandName} - ${clientId} - responses`);
  const spreadsheetFile = DriveApp.getFileById(spreadsheet.getId());
  folder.addFile(spreadsheetFile);
  DriveApp.getRootFolder().removeFile(spreadsheetFile);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheet.getId());
  return spreadsheet;
}

function ensureOutputsSheet_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName('outputs');
  if (sheet) {
    return sheet;
  }

  sheet = spreadsheet.insertSheet('outputs');
  sheet.appendRow([
    'output_id',
    'task_id',
    'client_id',
    'type',
    'title',
    'content_body',
    'verdict',
    'confidence',
    'boss',
    'manager',
    'window',
    'brand',
    'created_at'
  ]);
  return sheet;
}

function resolveWorkspaceFolder_() {
  const properties = PropertiesService.getScriptProperties();
  const folderId = properties.getProperty('GOOGLE_WORKSPACE_FOLDER_ID');

  if (folderId) {
    return DriveApp.getFolderById(folderId);
  }

  return DriveApp.getRootFolder();
}

function createHeaderMap_(headerRow) {
  const headerMap = {};
  for (var index = 0; index < headerRow.length; index += 1) {
    headerMap[String(headerRow[index]).trim()] = index;
  }
  return headerMap;
}

function getCellByHeader_(row, headerMap, headerName) {
  const index = headerMap[headerName];
  if (typeof index !== 'number') {
    return '';
  }
  return row[index];
}

function normalizeTimestamp_(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    return new Date(value).toISOString();
  }
  return '';
}

function normalizeFeedbackType_(value) {
  const text = safeString_(value);
  if (text === 'approve' || text === 'minor_change' || text === 'reject') {
    return text;
  }
  return 'minor_change';
}

function assertWebhookSecret_(e) {
  const expected = PropertiesService.getScriptProperties().getProperty(REQUIRED_SECRET_PROPERTY);
  if (!expected) {
    return;
  }

  const provided = (e && e.parameter && e.parameter.secret) || '';
  if (provided === expected) {
    return;
  }

  throw new Error('Webhook secret validation failed.');
}

function requireString_(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing required field: ${fieldName}`);
  }
  return value.trim();
}

function safeString_(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return typeof value === 'string' ? value.trim() : String(value);
}

function nullableString_(value) {
  const normalized = safeString_(value);
  return normalized || null;
}

function jsonResponse_(statusCode, payload) {
  return ContentService
    .createTextOutput(JSON.stringify({ statusCode, ...payload }))
    .setMimeType(ContentService.MimeType.JSON);
}
