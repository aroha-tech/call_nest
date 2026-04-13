import { Router } from 'express';
import * as industryFieldDefinitionsController from '../../controllers/superAdmin/industryFieldDefinitionsController.js';
import { platformAuthMiddleware } from '../../middleware/auth.js';

const router = Router({ mergeParams: true });

router.use(platformAuthMiddleware);

router.get('/', industryFieldDefinitionsController.listByIndustry);
router.post('/', industryFieldDefinitionsController.create);
router.put('/:fieldId', industryFieldDefinitionsController.update);
router.delete('/:fieldId', industryFieldDefinitionsController.remove);

export default router;
