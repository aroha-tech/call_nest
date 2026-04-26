import { Router } from 'express';
import * as dialerPublicController from '../../controllers/public/dialerPublicController.js';
import { publicIntegrationAuth, requirePublicScope } from '../../middleware/publicIntegrationAuth.js';

const router = Router();

router.use(publicIntegrationAuth);

router.post('/contacts/upsert', requirePublicScope('contacts.write'), dialerPublicController.upsertContacts);
router.post('/calls/click-to-call', requirePublicScope('calls.write'), dialerPublicController.clickToCall);
router.post('/calls/lifecycle', requirePublicScope('calls.write'), dialerPublicController.lifecycle);
router.post('/activities/writeback', requirePublicScope('activities.write'), dialerPublicController.writeActivity);
router.post('/events/process', requirePublicScope('events.read'), dialerPublicController.processOutbox);
router.get('/events/deliveries', requirePublicScope('events.read'), dialerPublicController.listDeliveries);
router.post('/events/replay/:outboxId', requirePublicScope('events.read'), dialerPublicController.replayDelivery);
router.post('/providers/zoho/contacts/sync', requirePublicScope('contacts.write'), dialerPublicController.zohoSync);
router.post('/providers/zoho/calls/click-to-call', requirePublicScope('calls.write'), dialerPublicController.zohoClickToCall);
router.post('/providers/zoho/activities/writeback', requirePublicScope('activities.write'), dialerPublicController.zohoWriteback);

export default router;
