import { Router } from 'express';
import { attendanceService } from '../services/attendanceService.js';

const router = Router();

// Get meeting attendance list & summary
router.get('/:meetingId', (req, res) => {
  try {
    const { meetingId } = req.params;
    const data = attendanceService.getMeetingAttendance(meetingId);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Export attendance CSV
router.get('/:meetingId/export', (req, res) => {
  try {
    const { meetingId } = req.params;
    const csvData = attendanceService.exportAttendanceCsv(meetingId);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-${meetingId}.csv"`);
    res.status(200).send(csvData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

