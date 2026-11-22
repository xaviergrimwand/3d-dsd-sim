(function (global) {
  'use strict';

  /**
   * ShiftStats - Per-department DD-SSSS receipt numbering, live KPI scoring,
   * and end-of-shift performance breakdown matching DSD Receiving Simulator.
   */
  function createEmptyStats() {
    return {
      vendorsProcessed: 0,
      nightDropsProcessed: 0,
      trucksProcessed: 0,
      warehouseTrucksProcessed: 0,
      tasksCompleted: 0,
      recallsCompleted: 0,
      suppliesCompleted: false,
      claimsAllDone: false,
      backstockPutAway: false,
      backstockInventoried: false,
      filingDone: false,

      errorsMade: 0,
      inaccurateInvoices: 0,
      refusedGoodMerch: 0,
      acceptedOutOfTemp: 0,
      missedTempChecks: 0,
      priorityAdherenceViolations: 0,
      doorOpenPenalties: 0,
      doorOpenProlongedPenalties: 0,
      supplyOutOfStockCount: 0,
      wrongClaimDispositions: 0,
      wrongHazwasteDispositions: 0,
      wrongTaskActions: 0
    };
  }

  let stats = createEmptyStats();
  let receiptCounters = {};

  function getScoringConfig() {
    return (global.DSDCatalog && global.DSDCatalog.SCORING_CONFIG) || {
      positive: {
        nightDropCheckin: 200,
        sideDoorCheckin: 150,
        truckCheckin: 200,
        warehouseUnload: 350,
        taskComplete: 250,
        recallComplete: 500,
        suppliesPutAway: 300,
        claimsAllDone: 400,
        backstockPutAway: 300,
        backstockInventoried: 300,
        filingComplete: 250
      },
      negative: {
        refuseGoodMerch: -300,
        acceptOutOfTemp: -800,
        missedTempCheck: -150,
        inaccurateInvoice: -100,
        priorityViolation: -150,
        outstandingSideDoor: -200,
        outstandingTruck: -200,
        outstandingNightDrop: -150,
        warehouseNotUnloaded: -400,
        claimsNotDone: -300,
        suppliesNotPutAway: -200,
        backstockNotPutAway: -200,
        backstockNotInventoried: -200,
        recallNotDone: -500,
        taskNotDone: -250,
        doorLeftOpen: -200,
        doorLeftOpenProlonged: -100,
        supplyOutOfStock: -200,
        wrongClaimDisposition: -50,
        wrongHazwasteDisposition: -150,
        wrongTaskAction: -100
      }
    };
  }

  function padDept(deptNo) {
    const cleanDept = String(deptNo || '').replace(/\D/g, '');
    return cleanDept ? cleanDept.padStart(2, '0').slice(-2) : '20';
  }

  function generateReceiptNumber(deptNo, existingReceipts) {
    const paddedDept = padDept(deptNo);
    if (receiptCounters[paddedDept] === undefined) {
      let count = 0;
      if (Array.isArray(existingReceipts)) {
        existingReceipts.forEach((r) => {
          if (r && padDept(r.deptNo) === paddedDept) count++;
        });
      }
      receiptCounters[paddedDept] = count;
    }
    receiptCounters[paddedDept] += 1;
    const seqStr = String(receiptCounters[paddedDept]).padStart(4, '0');
    return paddedDept + '-' + seqStr;
  }

  function resetDailyStats() {
    stats = createEmptyStats();
    receiptCounters = {};
  }

  function increment(key, amount) {
    if (typeof stats[key] === 'number') {
      stats[key] += (amount === undefined ? 1 : amount);
    }
  }

  function setFlag(key, value) {
    if (typeof stats[key] === 'boolean') {
      stats[key] = Boolean(value);
    }
  }

  function getStats() {
    return Object.assign({}, stats);
  }

  function getLiveScore() {
    const sc = getScoringConfig();
    const scp = sc.positive;
    const scn = sc.negative;

    return (
      stats.vendorsProcessed * scp.sideDoorCheckin +
      stats.nightDropsProcessed * scp.nightDropCheckin +
      stats.trucksProcessed * scp.truckCheckin +
      stats.warehouseTrucksProcessed * scp.warehouseUnload +
      stats.tasksCompleted * scp.taskComplete +
      stats.recallsCompleted * scp.recallComplete +
      (stats.suppliesCompleted ? scp.suppliesPutAway : 0) +
      (stats.claimsAllDone ? scp.claimsAllDone : 0) +
      (stats.backstockPutAway ? scp.backstockPutAway : 0) +
      (stats.backstockInventoried ? scp.backstockInventoried : 0) +
      (stats.filingDone ? scp.filingComplete : 0) +
      stats.priorityAdherenceViolations * scn.priorityViolation +
      stats.inaccurateInvoices * scn.inaccurateInvoice +
      stats.refusedGoodMerch * scn.refuseGoodMerch +
      stats.acceptedOutOfTemp * scn.acceptOutOfTemp +
      (stats.missedTempChecks || 0) * (scn.missedTempCheck !== undefined ? scn.missedTempCheck : -150) +
      stats.doorOpenPenalties * scn.doorLeftOpen +
      stats.doorOpenProlongedPenalties * scn.doorLeftOpenProlonged +
      stats.supplyOutOfStockCount * scn.supplyOutOfStock +
      (stats.wrongClaimDispositions || 0) * (scn.wrongClaimDisposition !== undefined ? scn.wrongClaimDisposition : -50) +
      (stats.wrongHazwasteDispositions || 0) * (scn.wrongHazwasteDisposition !== undefined ? scn.wrongHazwasteDisposition : -150) +
      (stats.wrongTaskActions || 0) * (scn.wrongTaskAction !== undefined ? scn.wrongTaskAction : -100)
    );
  }

  function evaluateRank(totalScore) {
    if (totalScore >= 2000) return { label: 'RECEIVING MANAGER (EXPERT)', color: '#facc15' };
    if (totalScore >= 1200) return { label: 'SENIOR RECEIVING ASSOCIATE', color: '#facc15' };
    if (totalScore >= 600) return { label: 'LEAD DOCK CLERK', color: '#22c55e' };
    if (totalScore >= 200) return { label: 'DOCK HAND', color: '#38bdf8' };
    return { label: 'JUNIOR CLERK (RE-TRAINING)', color: '#ef4444' };
  }

  function computeShiftSummary(unfinished) {
    const u = unfinished || {};
    const sc = getScoringConfig();
    const scp = sc.positive;
    const scn = sc.negative;

    const nightDropScore = stats.nightDropsProcessed * scp.nightDropCheckin;
    const vendorsScore = stats.vendorsProcessed * scp.sideDoorCheckin;
    const trucksScore = stats.trucksProcessed * scp.truckCheckin;
    const warehouseScore = stats.warehouseTrucksProcessed * scp.warehouseUnload;
    const tasksScore = stats.tasksCompleted * scp.taskComplete;
    const recallScore = stats.recallsCompleted * scp.recallComplete;
    const suppliesScore = stats.suppliesCompleted ? scp.suppliesPutAway : 0;
    const claimsScore = stats.claimsAllDone ? scp.claimsAllDone : 0;
    const backstockPlacedScore = stats.backstockPutAway ? scp.backstockPutAway : 0;
    const backstockInvScore = stats.backstockInventoried ? scp.backstockInventoried : 0;
    const filingScore = stats.filingDone ? scp.filingComplete : 0;

    const totalPositive =
      nightDropScore + vendorsScore + trucksScore + warehouseScore +
      tasksScore + recallScore + suppliesScore + claimsScore +
      backstockPlacedScore + backstockInvScore + filingScore;

    const refuseGoodPenalty = stats.refusedGoodMerch * Math.abs(scn.refuseGoodMerch);
    const acceptTempPenalty = stats.acceptedOutOfTemp * Math.abs(scn.acceptOutOfTemp);
    const missedTempPenalty = (stats.missedTempChecks || 0) * Math.abs(scn.missedTempCheck !== undefined ? scn.missedTempCheck : 150);
    const inaccuratePenalty = stats.inaccurateInvoices * Math.abs(scn.inaccurateInvoice);
    const violationsPenalty = stats.priorityAdherenceViolations * Math.abs(scn.priorityViolation);
    const doorOpenPenalty = stats.doorOpenPenalties * Math.abs(scn.doorLeftOpen);
    const doorProlongedPenalty = stats.doorOpenProlongedPenalties * Math.abs(scn.doorLeftOpenProlonged);
    const supplyOutPenalty = stats.supplyOutOfStockCount * Math.abs(scn.supplyOutOfStock);
    const wrongClaimPenalty = (stats.wrongClaimDispositions || 0) * Math.abs(scn.wrongClaimDisposition !== undefined ? scn.wrongClaimDisposition : 50);
    const wrongHazwastePenalty = (stats.wrongHazwasteDispositions || 0) * Math.abs(scn.wrongHazwasteDisposition !== undefined ? scn.wrongHazwasteDisposition : 150);
    const wrongTaskPenalty = (stats.wrongTaskActions || 0) * Math.abs(scn.wrongTaskAction !== undefined ? scn.wrongTaskAction : 100);

    let endOfDayPenalty = 0;
    const endOfDayDetails = [];

    if (u.outstandingSideDoor) {
      endOfDayPenalty += Math.abs(scn.outstandingSideDoor);
      endOfDayDetails.push('Side door vendor not checked in');
    }
    const truckCount = Number(u.outstandingTrucks) || 0;
    for (let i = 0; i < truckCount; i++) {
      endOfDayPenalty += Math.abs(scn.outstandingTruck);
      endOfDayDetails.push('Truck vendor not checked in');
    }
    const nightDropCount = Number(u.outstandingNightDrops) || 0;
    for (let i = 0; i < nightDropCount; i++) {
      endOfDayPenalty += Math.abs(scn.outstandingNightDrop);
      endOfDayDetails.push('Night drop invoice not processed');
    }
    const warehouseCount = Number(u.outstandingWarehouse) || 0;
    for (let i = 0; i < warehouseCount; i++) {
      endOfDayPenalty += Math.abs(scn.warehouseNotUnloaded);
      endOfDayDetails.push('Warehouse truck not unloaded');
    }
    if (u.unclaimedItems > 0) {
      endOfDayPenalty += Math.abs(scn.claimsNotDone);
      endOfDayDetails.push('Claims not finished (' + u.unclaimedItems + ' items)');
    }
    if (u.unplacedSupplies > 0) {
      endOfDayPenalty += Math.abs(scn.suppliesNotPutAway);
      endOfDayDetails.push('Supplies not put away (' + u.unplacedSupplies + ')');
    }
    if (u.unplacedBackstock > 0) {
      endOfDayPenalty += Math.abs(scn.backstockNotPutAway);
      endOfDayDetails.push('Backstock not put away (' + u.unplacedBackstock + ')');
    }
    if (u.uninventoriedBackstock > 0) {
      endOfDayPenalty += Math.abs(scn.backstockNotInventoried);
      endOfDayDetails.push('Backstock not inventoried (' + u.uninventoriedBackstock + ')');
    }
    if (u.pendingRecall) {
      endOfDayPenalty += Math.abs(scn.recallNotDone);
      endOfDayDetails.push('Product recall not completed');
    }
    const pendingTaskCount = Number(u.pendingTasks) || 0;
    for (let i = 0; i < pendingTaskCount; i++) {
      endOfDayPenalty += Math.abs(scn.taskNotDone);
      endOfDayDetails.push('Receiving task not completed');
    }

    const operationalErrorsPenalty = refuseGoodPenalty + acceptTempPenalty + missedTempPenalty + inaccuratePenalty + wrongClaimPenalty + wrongTaskPenalty;
    const compliancePenalty = violationsPenalty + doorOpenPenalty + doorProlongedPenalty + supplyOutPenalty + wrongHazwastePenalty + endOfDayPenalty;
    const totalNegative = operationalErrorsPenalty + compliancePenalty;
    const totalScore = totalPositive - totalNegative;

    return {
      stats: getStats(),
      breakdown: {
        vendorsScore: vendorsScore,
        trucksScore: trucksScore + warehouseScore,
        nightDropScore: nightDropScore,
        tasksScore: tasksScore + recallScore,
        checklistScore: claimsScore + suppliesScore + backstockPlacedScore + backstockInvScore + filingScore,
        compliancePenalty: compliancePenalty,
        operationalErrorsPenalty: operationalErrorsPenalty
      },
      endOfDayDetails: endOfDayDetails,
      totalPositive: totalPositive,
      totalNegative: totalNegative,
      totalScore: totalScore,
      rank: evaluateRank(totalScore)
    };
  }

  global.ShiftStats = {
    generateReceiptNumber: generateReceiptNumber,
    resetDailyStats: resetDailyStats,
    increment: increment,
    setFlag: setFlag,
    getStats: getStats,
    getLiveScore: getLiveScore,
    evaluateRank: evaluateRank,
    computeShiftSummary: computeShiftSummary
  };
})(window);

