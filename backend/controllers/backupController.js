const ExcelJS = require('exceljs');
const Player = require('../models/Player');
const Payment = require('../models/Payment');
const { decrypt } = require('../utils/encryption');
const { createAuditLog } = require('../utils/audit');

const safeDecrypt = (value) => {
  if (!value) return '';
  try {
    return decrypt(value);
  } catch (error) {
    return '';
  }
};

const getPlayerGroups = (player) => {
  const groups = player.groupIds?.length ? player.groupIds : [player.groupId].filter(Boolean);
  return [...new Set(groups.map((group) => group?.name).filter(Boolean))].join(', ');
};

const getCurrentPayments = (player, payments) => payments.filter((payment) => {
  if (player.currentSubscriptionStartedAt) {
    return payment.createdAt && new Date(payment.createdAt) >= new Date(player.currentSubscriptionStartedAt);
  }
  if (!player.startDate) return true;
  return new Date(payment.paymentDate || 0) >= new Date(player.startDate);
});

const exportPlayersBackup = async (req, res, next) => {
  try {
    const [players, payments] = await Promise.all([
      Player.find()
        .sort({ fullName: 1, _id: 1 })
        .populate('parentId', 'name email phoneEncrypted')
        .populate('programId', 'name level price')
        .populate('groupId', 'name')
        .populate('groupIds', 'name')
        .populate('coachId', 'name'),
      Payment.find().sort({ paymentDate: 1, _id: 1 })
    ]);

    const paymentsByPlayer = new Map();
    payments.forEach((payment) => {
      const playerId = String(payment.playerId);
      if (!paymentsByPlayer.has(playerId)) paymentsByPlayer.set(playerId, []);
      paymentsByPlayer.get(playerId).push(payment);
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Warriors Gymnastics Management';
    workbook.created = new Date();
    workbook.modified = new Date();
    const worksheet = workbook.addWorksheet('Players Backup', {
      views: [{ state: 'frozen', ySplit: 4 }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });
    worksheet.properties.defaultRowHeight = 20;
    worksheet.views = [{ state: 'frozen', ySplit: 4, showGridLines: false }];

    const headers = [
      'Player ID', 'Player Name', 'Date of Birth', 'Status', 'Parent Name', 'Parent Phone',
      'Parent Email', 'Program', 'Level', 'Coach', 'Groups', 'Package', 'Classes', 'Hours',
      'Start Date', 'End Date', 'Price', 'Paid', 'Remaining', 'Note', 'Added At', 'Deleted'
    ];

    const rows = players.map((player, index) => {
      const playerPayments = getCurrentPayments(player, paymentsByPlayer.get(String(player._id)) || []);
      const totalPaid = playerPayments.reduce((sum, payment) => sum + Number(payment.paidAmount || 0), 0);
      const price = Number(player.payment || 0);
      const excelRow = index + 5;
      const parentPhone = safeDecrypt(player.parentId?.phoneEncrypted) || safeDecrypt(player.parentPhoneEncrypted);

      return [
        String(player._id),
        player.fullName || '',
        player.dateOfBirth || null,
        player.status || 'active',
        player.parentId?.name || '',
        parentPhone,
        player.parentId?.email || '',
        player.programId?.name || '',
        player.level || player.programId?.level || '',
        player.coachId?.name || '',
        getPlayerGroups(player),
        player.packageName || '',
        Number(player.packageClasses || 0),
        Number(player.packageHours || 0),
        player.startDate || null,
        player.endDate || null,
        price,
        totalPaid,
        { formula: `MAX(0,Q${excelRow}-R${excelRow})`, result: Math.max(0, price - totalPaid) },
        player.note || '',
        player.createdAt || null,
        player.isDeleted ? 'Yes' : 'No'
      ];
    });

    worksheet.mergeCells('A1:V1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'Warriors Gymnastics — Players Backup';
    titleCell.font = { name: 'Arial', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF991B1B' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 34;

    worksheet.mergeCells('A2:D2');
    worksheet.getCell('A2').value = `Generated: ${new Date().toLocaleString('en-GB')}`;
    worksheet.mergeCells('E2:H2');
    worksheet.getCell('E2').value = `Players: ${players.length}`;
    for (let column = 1; column <= 8; column += 1) {
      const cell = worksheet.getCell(2, column);
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF475569' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    }

    worksheet.addTable({
      name: 'PlayersBackupTable',
      ref: 'A4',
      headerRow: true,
      totalsRow: false,
      style: { theme: 'TableStyleMedium2', showRowStripes: true, showColumnStripes: false },
      columns: headers.map((name) => ({ name, filterButton: true })),
      rows
    });

    worksheet.getRow(4).height = 30;
    worksheet.getRow(4).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    worksheet.getRow(4).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber >= 5) {
        row.alignment = { vertical: 'middle', wrapText: true };
        row.font = { name: 'Arial', size: 10, color: { argb: 'FF1F2937' } };
      }
    });

    const widths = [26, 24, 14, 12, 22, 18, 26, 22, 15, 18, 36, 20, 10, 10, 14, 14, 14, 14, 14, 42, 18, 10];
    widths.forEach((width, index) => { worksheet.getColumn(index + 1).width = width; });
    ['C', 'O', 'P', 'U'].forEach((column) => { worksheet.getColumn(column).numFmt = 'yyyy-mm-dd'; });
    ['Q', 'R', 'S'].forEach((column) => { worksheet.getColumn(column).numFmt = '#,##0.00'; });
    ['M', 'N'].forEach((column) => { worksheet.getColumn(column).numFmt = '#,##0'; });
    worksheet.getColumn('A').numFmt = '@';
    worksheet.getColumn('F').numFmt = '@';

    const buffer = await workbook.xlsx.writeBuffer();
    const datePart = new Date().toISOString().split('T')[0];
    const filename = `Warriors-Players-Backup-${datePart}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    await createAuditLog({ userId: req.user._id, action: 'export players backup', entity: 'Player', req });
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

module.exports = { exportPlayersBackup };
