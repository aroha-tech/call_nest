import { Router } from 'express';
import multer from 'multer';
import * as scriptLanguageController from '../../controllers/tenant/scriptLanguageController.js';
import { tenantAuthMiddleware, requirePermission } from '../../middleware/auth.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.use(tenantAuthMiddleware);

const scriptsWrite = requirePermission(['settings.manage', 'scripts.self']);

router.get('/status', scriptsWrite, scriptLanguageController.getStatus);
router.post('/translate', scriptsWrite, scriptLanguageController.translate);
router.post('/transcribe', scriptsWrite, upload.single('audio'), scriptLanguageController.transcribe);
router.post('/tts', scriptsWrite, scriptLanguageController.tts);

export default router;
