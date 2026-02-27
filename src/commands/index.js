const reportCommands = require('./reports');
const ReportSystem = require('../utils/reportSystem');

async function initializeReportSystem() {
    await ReportSystem.initialize();
}

module.exports = {
    reportCommands,
    ReportSystem,
    initializeReportSystem
};
