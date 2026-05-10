import { Router } from 'express';
import * as controller from '../../controllers/public/meetingFeedbackPublicController.js';

const router = Router();

router.get('/:token', controller.viewForm);
router.post('/:token', controller.submit);

export default router;
