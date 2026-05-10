import { Router } from 'express';
import * as dialerPhoneNumbersController from '../../controllers/superAdmin/dialerPhoneNumbersController.js';
import { platformAuthMiddleware } from '../../middleware/auth.js';

const router = Router();
router.use(platformAuthMiddleware);

router.get('/', dialerPhoneNumbersController.list);
router.post('/', dialerPhoneNumbersController.create);
router.put('/:id', dialerPhoneNumbersController.update);
router.delete('/:id', dialerPhoneNumbersController.remove);

export default router;
