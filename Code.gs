// ============================================
// OOSTAGRI LEIERSKAP FEEDBACK - APPS SCRIPT
// Weergawe 1.3.4 - Lees Melkstal antwoorde uit individuele kolomme
// ============================================

function doGet(e) {
  const params = e.parameter;
  const action = params.action;

  try {
    switch (action) {
      case 'login':
        return jsonResponse(login(params.code));

      case 'getInitialData':
        return jsonResponse(getInitialData(
          params.userId,
          params.role,
          params.monthId
        ));

      case 'getCurrentCycle':
        return jsonResponse(getCurrentCycle());

      case 'getSubjects':
        return jsonResponse(getSubjects(params.userId));

      case 'getEvaluationStatus':
        return jsonResponse(getEvaluationStatus(params.userId, params.cycleId));

      case 'submitEvaluation':
        const evalData = JSON.parse(params.data);
        return jsonResponse(submitEvaluation(evalData));

      case 'getUserEvaluations':
        return jsonResponse(getUserEvaluations(params.userId, params.cycleId));

      case 'updateEvaluation':
        const updateData = JSON.parse(params.data);
        return jsonResponse(updateEvaluation(updateData));

      case 'getCycleSummary':
        return jsonResponse(getCycleSummary(params.cycleId, params.requesterId));

      case 'getPersonDetail':
        return jsonResponse(getPersonDetail(params.subjectId, params.cycleId, params.requesterId));

      case 'exportEvaluations':
        return jsonResponse(exportEvaluations(
          params.cycleId,
          params.requesterId,
          params.personId || null
        ));

      case 'forgotCode':
        return jsonResponse(forgotCode(params.email));

      case 'getSubordinates':
        return jsonResponse(getSubordinates(params.supervisorId));

      case 'getMelkstalStatus':
        return jsonResponse(getMelkstalStatus(params.supervisorId, params.monthId));

      case 'getUserMelkstalEvaluations':
        return jsonResponse(getUserMelkstalEvaluations(params.userId));

      case 'submitMelkstalEvaluation':
        const melkstalData = JSON.parse(params.data);
        return jsonResponse(submitMelkstalEvaluation(melkstalData));

      default:
        return jsonResponse({ success: false, error: 'Ongeldige aksie: ' + action });
    }
  } catch (error) {
    console.error('doGet error:', error);
    return jsonResponse({ success: false, error: error.message });
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// HELPER: Find column index with fallback names
// ============================================
function findColumnIndex(headers, ...possibleNames) {
  for (const name of possibleNames) {
    const idx = headers.indexOf(name);
    if (idx >= 0) return idx;
  }
  return -1;
}

// ============================================
// HELPER: Normalize cycle ID to YYYY-MM string format
// ============================================
function normalizeCycleId(value) {
  if (!value) return '';

  // Already a string in correct format
  if (typeof value === 'string') {
    // If it's an ISO date string, parse and convert
    if (value.includes('T')) {
      const parsedDate = new Date(value);
      return Utilities.formatDate(parsedDate, Session.getScriptTimeZone(), 'yyyy-MM');
    }
    // Already in YYYY-MM format or similar
    return value;
  }

  // It's a Date object
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM');
  }

  // Fallback - convert to string
  return String(value);
}

// ============================================
// HELPER: Compare values as strings (handles number/string mismatch)
// ============================================
function compareAsString(val1, val2) {
  if (val1 === null || val1 === undefined || val2 === null || val2 === undefined) {
    return false;
  }
  return String(val1).trim() === String(val2).trim();
}

// ============================================
// GET INITIAL DATA - Kombineer alle data in een call (VINNIG!)
// ============================================
function getInitialData(userId, role, monthId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. Get current cycle
    const cyclesSheet = ss.getSheetByName('Cycles');
    if (!cyclesSheet) {
      return { success: false, error: 'Cycles sheet nie gevind nie' };
    }

    const cyclesData = cyclesSheet.getDataRange().getValues();
    const cycleHeaders = cyclesData[0];
    const cycleIdIdx = cycleHeaders.indexOf('ID');
    const cycleNameIdx = cycleHeaders.indexOf('Name');
    const cycleStartIdx = cycleHeaders.indexOf('StartDate');
    const cycleEndIdx = cycleHeaders.indexOf('EndDate');
    const cycleActiveIdx = cycleHeaders.indexOf('Active');

    let cycle = null;
    for (let i = 1; i < cyclesData.length; i++) {
      if (cyclesData[i][cycleActiveIdx] === true || cyclesData[i][cycleActiveIdx] === 'TRUE') {
        // Normalize cycle ID to YYYY-MM string format
        const rawCycleId = cyclesData[i][cycleIdIdx];
        const normalizedCycleId = normalizeCycleId(rawCycleId);
        console.log('Cycle ID raw:', rawCycleId, 'normalized:', normalizedCycleId);

        cycle = {
          id: normalizedCycleId,
          name: cyclesData[i][cycleNameIdx],
          startDate: cyclesData[i][cycleStartIdx],
          endDate: cyclesData[i][cycleEndIdx]
        };
        break;
      }
    }

    if (!cycle) {
      return { success: false, noCycle: true };
    }

    // 2. Get users for subjects and subordinates
    const usersSheet = ss.getSheetByName('Users');
    const usersData = usersSheet.getDataRange().getValues();
    const userHeaders = usersData[0];
    const uCodeIdx = userHeaders.indexOf('Code');
    const uNameIdx = userHeaders.indexOf('Name');
    const uRoleIdx = userHeaders.indexOf('Role');
    const uActiveIdx = userHeaders.indexOf('Active');
    const uSupervisorIdx = userHeaders.indexOf('SupervisorCode');
    const uLocationIdx = userHeaders.indexOf('Location');

    const subjects = [];
    const subordinates = [];

    for (let i = 1; i < usersData.length; i++) {
      const row = usersData[i];
      if (row[uActiveIdx] !== true && row[uActiveIdx] !== 'TRUE') continue;

      const userRole = row[uRoleIdx];
      const userCode = row[uCodeIdx];

      // Topbestuur members as subjects (for peer evaluation)
      if (userRole === 'topbestuur') {
        subjects.push({
          id: userCode,
          name: row[uNameIdx]
        });
      }

      // Subordinates (middelvlak under this supervisor)
      if (userRole === 'middelvlak' && compareAsString(row[uSupervisorIdx], userId)) {
        subordinates.push({
          id: userCode,
          name: row[uNameIdx],
          location: row[uLocationIdx] || ''
        });
      }
    }

    // 3. Get evaluations
    const evalsSheet = ss.getSheetByName('Evaluations');
    let evalsData = [[]];
    let evalHeaders = [];

    if (evalsSheet) {
      evalsData = evalsSheet.getDataRange().getValues();
      evalHeaders = evalsData[0] || [];
    }

    const eIdIdx = findColumnIndex(evalHeaders, 'ID');
    const eCycleIdx = findColumnIndex(evalHeaders, 'CycleID', 'CycleId', 'cycleId');
    const eEvaluatorIdx = findColumnIndex(evalHeaders, 'EvaluatorCode', 'evaluatorCode');
    const eSubjectIdx = findColumnIndex(evalHeaders, 'SubjectCode', 'subjectCode');
    const eSubjectNameIdx = findColumnIndex(evalHeaders, 'SubjectName', 'subjectName');
    const eSubmittedIdx = findColumnIndex(evalHeaders, 'SubmittedAt', 'submittedAt');

    const completedSubjects = [];
    const myEvaluations = [];

    // Debug logging
    console.log('Looking for cycle.id:', cycle.id);
    console.log('Evaluations rows:', evalsData.length - 1);

    for (let i = 1; i < evalsData.length; i++) {
      const row = evalsData[i];
      const rowCycleId = row[eCycleIdx];

      // Normalize both cycle IDs and compare
      const normalizedRowCycleId = normalizeCycleId(rowCycleId);
      const cycleMatch = (normalizedRowCycleId === cycle.id);

      console.log('Row', i, 'CycleID raw:', rowCycleId, 'normalized:', normalizedRowCycleId, 'cycle.id:', cycle.id, 'Match:', cycleMatch, 'Evaluator:', row[eEvaluatorIdx]);

      if (!cycleMatch) continue;

      if (compareAsString(row[eEvaluatorIdx], userId)) {
        completedSubjects.push(row[eSubjectIdx]);

        // Build evaluation object for history
        const evalObj = {
          id: row[eIdIdx],
          subjectId: row[eSubjectIdx],
          subjectName: row[eSubjectNameIdx],
          submittedAt: row[eSubmittedIdx],
          grades: {},
          comments: {}
        };

        let totalGrade = 0;
        let gradeCount = 0;
        for (let q = 1; q <= 7; q++) {
          const gradeIdx = findColumnIndex(evalHeaders, 'q' + q + 'Grade', 'Q' + q + 'Grade');
          const commentIdx = findColumnIndex(evalHeaders, 'q' + q + 'Comment', 'Q' + q + 'Comment');
          if (gradeIdx >= 0) {
            const grade = row[gradeIdx] || 0;
            evalObj.grades['q' + q] = grade;
            if (grade > 0) {
              totalGrade += grade;
              gradeCount++;
            }
          }
          if (commentIdx >= 0) {
            evalObj.comments['q' + q] = row[commentIdx] || '';
          }
        }
        evalObj.averageGrade = gradeCount > 0 ? totalGrade / gradeCount : 0;
        myEvaluations.push(evalObj);
      }
    }

    // 4. Get melkstal evaluations
    const melkstalSheet = ss.getSheetByName('MelkstalEvaluations');
    const completedSubordinates = [];
    const myMelkstalEvaluations = [];

    if (melkstalSheet) {
      const melkstalData = melkstalSheet.getDataRange().getValues();
      const mHeaders = melkstalData[0];

      // Support both 'Month' and 'MonthID' column names
      const mIdIdx = findColumnIndex(mHeaders, 'ID');
      const mEvaluatorIdx = findColumnIndex(mHeaders, 'EvaluatorCode', 'evaluatorCode');
      const mSubjectIdx = findColumnIndex(mHeaders, 'SubjectCode', 'subjectCode');
      const mSubjectNameIdx = findColumnIndex(mHeaders, 'SubjectName', 'subjectName');
      const mMonthIdx = findColumnIndex(mHeaders, 'Month', 'MonthID', 'monthId');
      const mSubmittedIdx = findColumnIndex(mHeaders, 'SubmittedAt', 'submittedAt');
      const mAnswersIdx = findColumnIndex(mHeaders, 'Answers', 'answers');
      const mLocationIdx = findColumnIndex(mHeaders, 'Location', 'SubjectLocation', 'location');

      // Build a map of answer column indices (ms1, ms2, ms3, etc.)
      const mAnswerColumnMap = {};
      mHeaders.forEach((header, idx) => {
        if (header && header.toString().match(/^ms\d/i)) {
          mAnswerColumnMap[header] = idx;
        }
      });

      console.log('MelkstalEvaluations columns - Month idx:', mMonthIdx, 'Answer columns:', Object.keys(mAnswerColumnMap).length);
      console.log('Looking for monthId:', monthId, 'and userId:', userId);

      for (let i = 1; i < melkstalData.length; i++) {
        const row = melkstalData[i];
        const rowEvaluator = row[mEvaluatorIdx];
        const rowMonth = row[mMonthIdx];

        if (!compareAsString(rowEvaluator, userId)) continue;

        // Check month match for completed status
        if (rowMonth === monthId) {
          completedSubordinates.push(row[mSubjectIdx]);
        }

        // Parse answers - first try JSON "Answers" column
        let answers = {};
        if (mAnswersIdx >= 0 && row[mAnswersIdx]) {
          try {
            answers = typeof row[mAnswersIdx] === 'string'
              ? JSON.parse(row[mAnswersIdx])
              : row[mAnswersIdx];
          } catch (e) {
            console.log('Could not parse answers:', e);
          }
        }

        // If no answers from JSON, read from individual columns (ms1, ms2, etc.)
        if (Object.keys(answers).length === 0 && Object.keys(mAnswerColumnMap).length > 0) {
          for (const [colName, colIdx] of Object.entries(mAnswerColumnMap)) {
            const value = row[colIdx];
            if (value !== undefined && value !== null && value !== '') {
              answers[colName] = value;
            }
          }
        }

        myMelkstalEvaluations.push({
          id: row[mIdIdx],
          subjectCode: row[mSubjectIdx],
          subjectName: row[mSubjectNameIdx],
          location: mLocationIdx >= 0 ? (row[mLocationIdx] || '') : '',
          month: rowMonth,
          submittedAt: row[mSubmittedIdx],
          answers: answers
        });
      }
    }

    // 5. Get coach data if applicable
    let coachData = null;
    if (role === 'coach') {
      coachData = buildCoachSummary(cycle.id, evalsData, evalHeaders, subjects);
    }

    console.log('Returning - myEvaluations:', myEvaluations.length, 'myMelkstalEvaluations:', myMelkstalEvaluations.length);

    return {
      success: true,
      cycle: cycle,
      subjects: subjects,
      completedSubjects: completedSubjects,
      myEvaluations: myEvaluations,
      subordinates: subordinates,
      completedSubordinates: completedSubordinates,
      myMelkstalEvaluations: myMelkstalEvaluations,
      coachData: coachData
    };

  } catch (e) {
    console.error('getInitialData error:', e);
    return { success: false, error: e.message };
  }
}

// Helper function for coach summary
function buildCoachSummary(cycleId, evalsData, evalHeaders, subjects) {
  const personSummaries = [];
  let totalCompleted = 0;

  const eCycleIdx = findColumnIndex(evalHeaders, 'CycleID', 'CycleId', 'cycleId');
  const eEvaluatorIdx = findColumnIndex(evalHeaders, 'EvaluatorCode', 'evaluatorCode');
  const eSubjectIdx = findColumnIndex(evalHeaders, 'SubjectCode', 'subjectCode');

  subjects.forEach(subject => {
    const subjectEvals = [];
    for (let i = 1; i < evalsData.length; i++) {
      const rowCycleId = evalsData[i][eCycleIdx];

      // Normalize and compare cycle IDs
      const normalizedRowCycleId = normalizeCycleId(rowCycleId);
      const cycleMatch = (normalizedRowCycleId === cycleId);

      if (cycleMatch && evalsData[i][eSubjectIdx] === subject.id) {
        subjectEvals.push(evalsData[i]);
      }
    }

    const selfEval = subjectEvals.find(row => row[eEvaluatorIdx] === subject.id);
    const peerEvals = subjectEvals.filter(row => row[eEvaluatorIdx] !== subject.id);

    let totalAvg = 0;
    let avgCount = 0;
    const averageGrades = {};
    const selfGrades = {};

    for (let q = 1; q <= 7; q++) {
      const gradeIdx = findColumnIndex(evalHeaders, 'q' + q + 'Grade', 'Q' + q + 'Grade');
      if (gradeIdx < 0) continue;

      const peerGradeValues = peerEvals.map(e => e[gradeIdx]).filter(g => g > 0);
      if (peerGradeValues.length > 0) {
        const avg = peerGradeValues.reduce((a, b) => a + b, 0) / peerGradeValues.length;
        averageGrades['q' + q] = Math.round(avg * 10) / 10;
        totalAvg += avg;
        avgCount++;
      }

      if (selfEval && selfEval[gradeIdx] > 0) {
        selfGrades['q' + q] = selfEval[gradeIdx];
      }
    }

    totalCompleted += subjectEvals.length;

    personSummaries.push({
      subjectId: subject.id,
      subjectName: subject.name,
      overallAverage: avgCount > 0 ? Math.round((totalAvg / avgCount) * 10) / 10 : 0,
      peerEvalCount: peerEvals.length,
      hasSelfEval: !!selfEval,
      averageGrades: averageGrades,
      selfGrades: selfGrades
    });
  });

  const totalExpected = subjects.length * subjects.length;

  return {
    personSummaries: personSummaries,
    totalSubjects: subjects.length,
    totalCompleted: totalCompleted,
    totalExpected: totalExpected,
    completionRate: totalExpected > 0 ? Math.round((totalCompleted / totalExpected) * 100) : 0
  };
}

// ============================================
// LOGIN
// ============================================
function login(code) {
  if (!code) {
    return { success: false, error: 'Geen kode verskaf' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName('Users');

  if (!usersSheet) {
    return { success: false, error: 'Users sheet nie gevind nie' };
  }

  const data = usersSheet.getDataRange().getValues();
  const headers = data[0];
  const codeIdx = headers.indexOf('Code');
  const nameIdx = headers.indexOf('Name');
  const emailIdx = headers.indexOf('Email');
  const roleIdx = headers.indexOf('Role');
  const activeIdx = headers.indexOf('Active');

  const codeLower = code.toLowerCase().trim();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[codeIdx] && row[codeIdx].toString().toLowerCase() === codeLower) {
      if (row[activeIdx] !== true && row[activeIdx] !== 'TRUE') {
        return { success: false, error: 'Hierdie rekening is gedeaktiveer' };
      }

      return {
        success: true,
        user: {
          code: row[codeIdx],
          name: row[nameIdx],
          email: row[emailIdx],
          role: row[roleIdx]
        }
      };
    }
  }

  return { success: false, error: 'Ongeldige kode' };
}

// ============================================
// GET CURRENT CYCLE
// ============================================
function getCurrentCycle() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cyclesSheet = ss.getSheetByName('Cycles');

  if (!cyclesSheet) {
    return { success: false, error: 'Cycles sheet nie gevind nie' };
  }

  const data = cyclesSheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx = headers.indexOf('ID');
  const nameIdx = headers.indexOf('Name');
  const startIdx = headers.indexOf('StartDate');
  const endIdx = headers.indexOf('EndDate');
  const activeIdx = headers.indexOf('Active');

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[activeIdx] === true || row[activeIdx] === 'TRUE') {
      return {
        success: true,
        cycle: {
          id: row[idIdx],
          name: row[nameIdx],
          startDate: row[startIdx],
          endDate: row[endIdx]
        }
      };
    }
  }

  return { success: false, noCycle: true };
}

// ============================================
// GET SUBJECTS (Topbestuur members to evaluate)
// ============================================
function getSubjects(userId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName('Users');

  if (!usersSheet) {
    return { success: false, error: 'Users sheet nie gevind nie' };
  }

  const data = usersSheet.getDataRange().getValues();
  const headers = data[0];
  const codeIdx = headers.indexOf('Code');
  const nameIdx = headers.indexOf('Name');
  const roleIdx = headers.indexOf('Role');
  const activeIdx = headers.indexOf('Active');

  const subjects = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[activeIdx] !== true && row[activeIdx] !== 'TRUE') continue;
    if (row[roleIdx] !== 'topbestuur') continue;

    subjects.push({
      id: row[codeIdx],
      name: row[nameIdx]
    });
  }

  return { success: true, subjects: subjects };
}

// ============================================
// GET EVALUATION STATUS
// ============================================
function getEvaluationStatus(userId, cycleId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const evalsSheet = ss.getSheetByName('Evaluations');

  if (!evalsSheet) {
    return { success: true, completedSubjects: [] };
  }

  const data = evalsSheet.getDataRange().getValues();
  const headers = data[0];
  const cycleIdx = findColumnIndex(headers, 'CycleID', 'CycleId', 'cycleId');
  const evaluatorIdx = findColumnIndex(headers, 'EvaluatorCode', 'evaluatorCode');
  const subjectIdx = findColumnIndex(headers, 'SubjectCode', 'subjectCode');

  const completedSubjects = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowCycleId = row[cycleIdx];

    // Normalize and compare cycle IDs
    const normalizedRowCycleId = normalizeCycleId(rowCycleId);
    const cycleMatch = (normalizedRowCycleId === cycleId);

    if (cycleMatch && compareAsString(row[evaluatorIdx], userId)) {
      completedSubjects.push(row[subjectIdx]);
    }
  }

  return { success: true, completedSubjects: completedSubjects };
}

// ============================================
// SUBMIT EVALUATION
// ============================================
function submitEvaluation(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let evalsSheet = ss.getSheetByName('Evaluations');

  if (!evalsSheet) {
    evalsSheet = ss.insertSheet('Evaluations');
    evalsSheet.appendRow([
      'ID', 'CycleID', 'EvaluatorCode', 'EvaluatorName',
      'SubjectCode', 'SubjectName', 'SubmittedAt', 'UpdatedAt',
      'q1Grade', 'q1Comment', 'q2Grade', 'q2Comment',
      'q3Grade', 'q3Comment', 'q4Grade', 'q4Comment',
      'q5Grade', 'q5Comment', 'q6Grade', 'q6Comment',
      'q7Grade', 'q7Comment'
    ]);
  }

  const id = Utilities.getUuid();
  const submittedAt = new Date().toISOString();

  const row = [
    id,
    data.cycleId,
    data.evaluatorCode,
    data.evaluatorName,
    data.subjectCode,
    data.subjectName,
    submittedAt,
    submittedAt,
    data.q1Grade || 0, data.q1Comment || '',
    data.q2Grade || 0, data.q2Comment || '',
    data.q3Grade || 0, data.q3Comment || '',
    data.q4Grade || 0, data.q4Comment || '',
    data.q5Grade || 0, data.q5Comment || '',
    data.q6Grade || 0, data.q6Comment || '',
    data.q7Grade || 0, data.q7Comment || ''
  ];

  evalsSheet.appendRow(row);

  return { success: true, id: id };
}

// ============================================
// GET USER EVALUATIONS (History)
// ============================================
function getUserEvaluations(userId, cycleId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const evalsSheet = ss.getSheetByName('Evaluations');

  if (!evalsSheet) {
    return { success: true, evaluations: [] };
  }

  const data = evalsSheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx = findColumnIndex(headers, 'ID');
  const cycleIdx = findColumnIndex(headers, 'CycleID', 'CycleId', 'cycleId');
  const evaluatorIdx = findColumnIndex(headers, 'EvaluatorCode', 'evaluatorCode');
  const subjectIdx = findColumnIndex(headers, 'SubjectCode', 'subjectCode');
  const subjectNameIdx = findColumnIndex(headers, 'SubjectName', 'subjectName');
  const submittedIdx = findColumnIndex(headers, 'SubmittedAt', 'submittedAt');

  const evaluations = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowCycleId = row[cycleIdx];

    // Normalize and compare cycle IDs
    const normalizedRowCycleId = normalizeCycleId(rowCycleId);
    const cycleMatch = (normalizedRowCycleId === cycleId);

    if (!cycleMatch || !compareAsString(row[evaluatorIdx], userId)) continue;

    const evalObj = {
      id: row[idIdx],
      subjectId: row[subjectIdx],
      subjectName: row[subjectNameIdx],
      submittedAt: row[submittedIdx],
      grades: {},
      comments: {}
    };

    let totalGrade = 0;
    let gradeCount = 0;

    for (let q = 1; q <= 7; q++) {
      const gradeIdx = findColumnIndex(headers, 'q' + q + 'Grade', 'Q' + q + 'Grade');
      const commentIdx = findColumnIndex(headers, 'q' + q + 'Comment', 'Q' + q + 'Comment');

      if (gradeIdx >= 0) {
        const grade = row[gradeIdx] || 0;
        evalObj.grades['q' + q] = grade;
        if (grade > 0) {
          totalGrade += grade;
          gradeCount++;
        }
      }
      if (commentIdx >= 0) {
        evalObj.comments['q' + q] = row[commentIdx] || '';
      }
    }

    evalObj.averageGrade = gradeCount > 0 ? totalGrade / gradeCount : 0;
    evaluations.push(evalObj);
  }

  return { success: true, evaluations: evaluations };
}

// ============================================
// UPDATE EVALUATION
// ============================================
function updateEvaluation(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const evalsSheet = ss.getSheetByName('Evaluations');

  if (!evalsSheet) {
    return { success: false, error: 'Evaluations sheet nie gevind nie' };
  }

  const sheetData = evalsSheet.getDataRange().getValues();
  const headers = sheetData[0];
  const idIdx = findColumnIndex(headers, 'ID');
  const submittedIdx = findColumnIndex(headers, 'SubmittedAt', 'submittedAt');
  const updatedIdx = findColumnIndex(headers, 'UpdatedAt', 'updatedAt');

  for (let i = 1; i < sheetData.length; i++) {
    if (sheetData[i][idIdx] === data.evaluationId) {
      // Check if within 24 hours
      const submittedAt = new Date(sheetData[i][submittedIdx]);
      const now = new Date();
      const hoursDiff = (now - submittedAt) / (1000 * 60 * 60);

      if (hoursDiff > 24) {
        return { success: false, error: 'Wysigingstyd het verval (24 uur)' };
      }

      // Update the row
      for (let q = 1; q <= 7; q++) {
        const gradeIdx = findColumnIndex(headers, 'q' + q + 'Grade', 'Q' + q + 'Grade');
        const commentIdx = findColumnIndex(headers, 'q' + q + 'Comment', 'Q' + q + 'Comment');

        if (gradeIdx >= 0 && data['q' + q + 'Grade'] !== undefined) {
          evalsSheet.getRange(i + 1, gradeIdx + 1).setValue(data['q' + q + 'Grade']);
        }
        if (commentIdx >= 0 && data['q' + q + 'Comment'] !== undefined) {
          evalsSheet.getRange(i + 1, commentIdx + 1).setValue(data['q' + q + 'Comment']);
        }
      }

      // Update timestamp
      if (updatedIdx >= 0) {
        evalsSheet.getRange(i + 1, updatedIdx + 1).setValue(new Date().toISOString());
      }

      return { success: true };
    }
  }

  return { success: false, error: 'Evaluasie nie gevind nie' };
}

// ============================================
// GET CYCLE SUMMARY (Coach)
// ============================================
function getCycleSummary(cycleId, requesterId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Verify requester is coach
  const usersSheet = ss.getSheetByName('Users');
  const usersData = usersSheet.getDataRange().getValues();
  const userHeaders = usersData[0];
  const uCodeIdx = userHeaders.indexOf('Code');
  const uRoleIdx = userHeaders.indexOf('Role');

  let isCoach = false;
  for (let i = 1; i < usersData.length; i++) {
    if (compareAsString(usersData[i][uCodeIdx], requesterId) && usersData[i][uRoleIdx] === 'coach') {
      isCoach = true;
      break;
    }
  }

  if (!isCoach) {
    return { success: false, error: 'Nie gemagtig nie' };
  }

  // Get subjects
  const subjects = [];
  const uNameIdx = userHeaders.indexOf('Name');
  const uActiveIdx = userHeaders.indexOf('Active');

  for (let i = 1; i < usersData.length; i++) {
    const row = usersData[i];
    if ((row[uActiveIdx] === true || row[uActiveIdx] === 'TRUE') && row[uRoleIdx] === 'topbestuur') {
      subjects.push({ id: row[uCodeIdx], name: row[uNameIdx] });
    }
  }

  // Get evaluations
  const evalsSheet = ss.getSheetByName('Evaluations');
  if (!evalsSheet) {
    return {
      success: true,
      summary: {
        personSummaries: [],
        totalSubjects: subjects.length,
        totalCompleted: 0,
        totalExpected: subjects.length * subjects.length,
        completionRate: 0
      }
    };
  }

  const evalsData = evalsSheet.getDataRange().getValues();
  const evalHeaders = evalsData[0];

  const summary = buildCoachSummary(cycleId, evalsData, evalHeaders, subjects);

  return { success: true, summary: summary };
}

// ============================================
// GET PERSON DETAIL (Coach)
// ============================================
function getPersonDetail(subjectId, cycleId, requesterId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Verify requester is coach
  const usersSheet = ss.getSheetByName('Users');
  const usersData = usersSheet.getDataRange().getValues();
  const userHeaders = usersData[0];
  const uCodeIdx = userHeaders.indexOf('Code');
  const uRoleIdx = userHeaders.indexOf('Role');

  let isCoach = false;
  for (let i = 1; i < usersData.length; i++) {
    if (compareAsString(usersData[i][uCodeIdx], requesterId) && usersData[i][uRoleIdx] === 'coach') {
      isCoach = true;
      break;
    }
  }

  if (!isCoach) {
    return { success: false, error: 'Nie gemagtig nie' };
  }

  const evalsSheet = ss.getSheetByName('Evaluations');
  if (!evalsSheet) {
    return { success: true, evaluations: [] };
  }

  const data = evalsSheet.getDataRange().getValues();
  const headers = data[0];
  const cycleIdx = findColumnIndex(headers, 'CycleID', 'CycleId', 'cycleId');
  const evaluatorIdx = findColumnIndex(headers, 'EvaluatorCode', 'evaluatorCode');
  const evaluatorNameIdx = findColumnIndex(headers, 'EvaluatorName', 'evaluatorName');
  const subjectIdx = findColumnIndex(headers, 'SubjectCode', 'subjectCode');
  const submittedIdx = findColumnIndex(headers, 'SubmittedAt', 'submittedAt');

  const evaluations = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowCycleId = row[cycleIdx];

    // Normalize and compare cycle IDs
    const normalizedRowCycleId = normalizeCycleId(rowCycleId);
    const cycleMatch = (normalizedRowCycleId === cycleId);

    if (!cycleMatch || row[subjectIdx] !== subjectId) continue;

    const evalObj = {
      evaluatorCode: row[evaluatorIdx],
      evaluatorName: row[evaluatorNameIdx],
      isSelfEval: row[evaluatorIdx] === subjectId,
      submittedAt: row[submittedIdx],
      grades: {},
      comments: {}
    };

    for (let q = 1; q <= 7; q++) {
      const gradeIdx = findColumnIndex(headers, 'q' + q + 'Grade', 'Q' + q + 'Grade');
      const commentIdx = findColumnIndex(headers, 'q' + q + 'Comment', 'Q' + q + 'Comment');
      if (gradeIdx >= 0) evalObj.grades['q' + q] = row[gradeIdx] || 0;
      if (commentIdx >= 0) evalObj.comments['q' + q] = row[commentIdx] || '';
    }

    evaluations.push(evalObj);
  }

  return { success: true, evaluations: evaluations };
}

// ============================================
// EXPORT EVALUATIONS (Coach)
// ============================================
function exportEvaluations(cycleId, requesterId, personId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Verify requester is coach
  const usersSheet = ss.getSheetByName('Users');
  const usersData = usersSheet.getDataRange().getValues();
  const userHeaders = usersData[0];
  const uCodeIdx = userHeaders.indexOf('Code');
  const uRoleIdx = userHeaders.indexOf('Role');

  let isCoach = false;
  for (let i = 1; i < usersData.length; i++) {
    if (compareAsString(usersData[i][uCodeIdx], requesterId) && usersData[i][uRoleIdx] === 'coach') {
      isCoach = true;
      break;
    }
  }

  if (!isCoach) {
    return { success: false, error: 'Nie gemagtig nie' };
  }

  const evalsSheet = ss.getSheetByName('Evaluations');
  if (!evalsSheet) {
    return { success: true, evaluations: [] };
  }

  const data = evalsSheet.getDataRange().getValues();
  const headers = data[0];
  const cycleIdx = findColumnIndex(headers, 'CycleID', 'CycleId', 'cycleId');
  const evaluatorIdx = findColumnIndex(headers, 'EvaluatorCode', 'evaluatorCode');
  const evaluatorNameIdx = findColumnIndex(headers, 'EvaluatorName', 'evaluatorName');
  const subjectIdx = findColumnIndex(headers, 'SubjectCode', 'subjectCode');
  const subjectNameIdx = findColumnIndex(headers, 'SubjectName', 'subjectName');
  const submittedIdx = findColumnIndex(headers, 'SubmittedAt', 'submittedAt');

  const evaluations = [];

  // Normalize the cycleId parameter too
  const normalizedCycleIdParam = normalizeCycleId(cycleId);
  console.log('exportEvaluations - cycleId param:', cycleId, 'normalized:', normalizedCycleIdParam);
  console.log('Total rows in Evaluations:', data.length - 1);

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowCycleId = row[cycleIdx];

    // Normalize and compare cycle IDs
    const normalizedRowCycleId = normalizeCycleId(rowCycleId);
    const cycleMatch = (normalizedRowCycleId === normalizedCycleIdParam);

    console.log('Row', i, '- CycleID:', rowCycleId, 'normalized:', normalizedRowCycleId, 'match:', cycleMatch);

    if (!cycleMatch) continue;
    if (personId && row[subjectIdx] !== personId) continue;

    const evalObj = {
      evaluatorCode: row[evaluatorIdx],
      evaluatorName: row[evaluatorNameIdx],
      subjectCode: row[subjectIdx],
      subjectName: row[subjectNameIdx],
      isSelfEval: row[evaluatorIdx] === row[subjectIdx],
      submittedAt: row[submittedIdx],
      grades: {},
      comments: {}
    };

    for (let q = 1; q <= 7; q++) {
      const gradeIdx = findColumnIndex(headers, 'q' + q + 'Grade', 'Q' + q + 'Grade');
      const commentIdx = findColumnIndex(headers, 'q' + q + 'Comment', 'Q' + q + 'Comment');
      if (gradeIdx >= 0) evalObj.grades['q' + q] = row[gradeIdx] || 0;
      if (commentIdx >= 0) evalObj.comments['q' + q] = row[commentIdx] || '';
    }

    evaluations.push(evalObj);
  }

  return { success: true, evaluations: evaluations };
}

// ============================================
// FORGOT CODE
// ============================================
function forgotCode(email) {
  if (!email) {
    return { success: false, error: 'Geen e-pos verskaf' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName('Users');

  if (!usersSheet) {
    return { success: false, error: 'Users sheet nie gevind nie' };
  }

  const data = usersSheet.getDataRange().getValues();
  const headers = data[0];
  const codeIdx = headers.indexOf('Code');
  const nameIdx = headers.indexOf('Name');
  const emailIdx = headers.indexOf('Email');
  const activeIdx = headers.indexOf('Active');

  const emailLower = email.toLowerCase().trim();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[emailIdx] && row[emailIdx].toString().toLowerCase() === emailLower) {
      if (row[activeIdx] !== true && row[activeIdx] !== 'TRUE') {
        return { success: false, error: 'Hierdie rekening is gedeaktiveer' };
      }

      // Send email
      const subject = 'Oostagri Leierskap - Jou Aanmeldkode';
      const body = `Hallo ${row[nameIdx]},\n\nJou aanmeldkode vir die Oostagri Leierskap app is: ${row[codeIdx]}\n\nGroete,\nOostagri Leierskap Stelsel`;

      try {
        MailApp.sendEmail(row[emailIdx], subject, body);
        return { success: true };
      } catch (e) {
        return { success: false, error: 'Kon nie e-pos stuur nie' };
      }
    }
  }

  return { success: false, error: 'E-pos adres nie gevind nie' };
}

// ============================================
// GET SUBORDINATES (Middle management under supervisor)
// ============================================
function getSubordinates(supervisorId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName('Users');

  if (!usersSheet) {
    return { success: true, subordinates: [] };
  }

  const data = usersSheet.getDataRange().getValues();
  const headers = data[0];
  const codeIdx = headers.indexOf('Code');
  const nameIdx = headers.indexOf('Name');
  const roleIdx = headers.indexOf('Role');
  const activeIdx = headers.indexOf('Active');
  const supervisorIdx = headers.indexOf('SupervisorCode');
  const locationIdx = headers.indexOf('Location');

  const subordinates = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[activeIdx] !== true && row[activeIdx] !== 'TRUE') continue;
    if (row[roleIdx] !== 'middelvlak') continue;
    if (!compareAsString(row[supervisorIdx], supervisorId)) continue;

    subordinates.push({
      id: row[codeIdx],
      name: row[nameIdx],
      location: row[locationIdx] || ''
    });
  }

  return { success: true, subordinates: subordinates };
}

// ============================================
// GET MELKSTAL STATUS
// ============================================
function getMelkstalStatus(supervisorId, monthId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const melkstalSheet = ss.getSheetByName('MelkstalEvaluations');

  if (!melkstalSheet) {
    return { success: true, completedSubordinates: [] };
  }

  const data = melkstalSheet.getDataRange().getValues();
  const headers = data[0];
  const evaluatorIdx = findColumnIndex(headers, 'EvaluatorCode', 'evaluatorCode');
  const subjectIdx = findColumnIndex(headers, 'SubjectCode', 'subjectCode');
  const monthIdx = findColumnIndex(headers, 'Month', 'MonthID', 'monthId');

  const completedSubordinates = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (compareAsString(row[evaluatorIdx], supervisorId) && row[monthIdx] === monthId) {
      completedSubordinates.push(row[subjectIdx]);
    }
  }

  return { success: true, completedSubordinates: completedSubordinates };
}

// ============================================
// GET USER MELKSTAL EVALUATIONS
// ============================================
function getUserMelkstalEvaluations(userId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const melkstalSheet = ss.getSheetByName('MelkstalEvaluations');

  if (!melkstalSheet) {
    return { success: true, evaluations: [] };
  }

  const data = melkstalSheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx = findColumnIndex(headers, 'ID');
  const evaluatorIdx = findColumnIndex(headers, 'EvaluatorCode', 'evaluatorCode');
  const subjectIdx = findColumnIndex(headers, 'SubjectCode', 'subjectCode');
  const subjectNameIdx = findColumnIndex(headers, 'SubjectName', 'subjectName');
  const monthIdx = findColumnIndex(headers, 'Month', 'MonthID', 'monthId');
  const submittedIdx = findColumnIndex(headers, 'SubmittedAt', 'submittedAt');
  const answersIdx = findColumnIndex(headers, 'Answers', 'answers');
  const locationIdx = findColumnIndex(headers, 'Location', 'SubjectLocation', 'location');

  // Build a map of answer column indices (ms1, ms2, ms3, etc.)
  const answerColumnMap = {};
  headers.forEach((header, idx) => {
    if (header && header.toString().match(/^ms\d/i)) {
      answerColumnMap[header] = idx;
    }
  });

  const evaluations = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!compareAsString(row[evaluatorIdx], userId)) continue;

    let answers = {};

    // First try to get answers from JSON "Answers" column
    if (answersIdx >= 0 && row[answersIdx]) {
      try {
        answers = typeof row[answersIdx] === 'string'
          ? JSON.parse(row[answersIdx])
          : row[answersIdx];
      } catch (e) {
        console.log('Could not parse answers:', e);
      }
    }

    // If no answers from JSON, read from individual columns (ms1, ms2, etc.)
    if (Object.keys(answers).length === 0 && Object.keys(answerColumnMap).length > 0) {
      for (const [colName, colIdx] of Object.entries(answerColumnMap)) {
        const value = row[colIdx];
        if (value !== undefined && value !== null && value !== '') {
          answers[colName] = value;
        }
      }
    }

    evaluations.push({
      id: row[idIdx],
      subjectCode: row[subjectIdx],
      subjectName: row[subjectNameIdx],
      location: locationIdx >= 0 ? (row[locationIdx] || '') : '',
      month: row[monthIdx],
      submittedAt: row[submittedIdx],
      answers: answers
    });
  }

  return { success: true, evaluations: evaluations };
}

// ============================================
// SUBMIT MELKSTAL EVALUATION
// ============================================
function submitMelkstalEvaluation(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let melkstalSheet = ss.getSheetByName('MelkstalEvaluations');

  if (!melkstalSheet) {
    melkstalSheet = ss.insertSheet('MelkstalEvaluations');
    melkstalSheet.appendRow([
      'ID', 'EvaluatorCode', 'EvaluatorName', 'SubjectCode',
      'SubjectName', 'Location', 'Month', 'Answers', 'SubmittedAt', 'UpdatedAt'
    ]);
  }

  const id = Utilities.getUuid();
  const submittedAt = new Date().toISOString();

  const row = [
    id,
    data.evaluatorCode,
    data.evaluatorName,
    data.subjectCode,
    data.subjectName,
    data.subjectLocation || '',
    data.monthId,
    JSON.stringify(data.answers || data),
    submittedAt,
    submittedAt
  ];

  melkstalSheet.appendRow(row);

  return { success: true, id: id };
}
