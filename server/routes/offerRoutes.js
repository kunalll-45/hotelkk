import express from 'express';
import { OfferService } from '../services/offerService.js';
import { ActivityLogger } from '../services/activityLogger.js';

export default function createOfferRouter(io) {
  const router = express.Router();

  // Get all offers (Manager view)
  router.get('/', (req, res) => {
    try {
      const offers = OfferService.getAllOffers();
      res.json(offers);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get promotional offers for Customer Homepage & Banner Carousel
  router.get('/promotional', (req, res) => {
    try {
      const offers = OfferService.getPromotionalOffers();
      res.json(offers);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get single offer
  router.get('/:id', (req, res) => {
    try {
      const offer = OfferService.getOfferById(req.params.id);
      res.json(offer);
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  // Create offer
  router.post('/', (req, res) => {
    try {
      const creatorName = req.body.creatorName || 'Manager';
      const newOffer = OfferService.createOffer(req.body, creatorName);

      io?.emit('offers:updated', { type: 'CREATED', offer: newOffer });

      ActivityLogger.logActivity(
        {
          category: 'OFFER',
          action: 'OFFER_CREATED',
          title: `New Offer Created: ${newOffer.title}`,
          description: `Created promotional offer "${newOffer.title}" (${newOffer.offer_type}). Validity: ${newOffer.start_datetime} to ${newOffer.end_datetime}.`,
          actorName: creatorName,
          actorRole: 'MANAGER',
          severity: 'SUCCESS',
          metadata: { id: newOffer.id, offerType: newOffer.offer_type, status: newOffer.status }
        },
        io
      );

      res.status(201).json(newOffer);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Update offer
  router.put('/:id', (req, res) => {
    try {
      const updated = OfferService.updateOffer(req.params.id, req.body);
      io?.emit('offers:updated', { type: 'UPDATED', offer: updated });

      ActivityLogger.logActivity(
        {
          category: 'OFFER',
          action: 'OFFER_UPDATED',
          title: `Offer Updated: ${updated.title}`,
          description: `Promotional offer #${updated.id} parameters were modified.`,
          actorName: req.body.creatorName || 'Manager',
          actorRole: 'MANAGER',
          severity: 'INFO',
          metadata: { id: updated.id, status: updated.status }
        },
        io
      );

      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Toggle active/inactive
  router.patch('/:id/toggle', (req, res) => {
    try {
      const toggled = OfferService.toggleOffer(req.params.id);
      io?.emit('offers:updated', { type: 'TOGGLED', offer: toggled });

      ActivityLogger.logActivity(
        {
          category: 'OFFER',
          action: 'OFFER_TOGGLED',
          title: `Offer ${toggled.is_active ? 'Activated' : 'Disabled'}: ${toggled.title}`,
          description: `Offer #${toggled.id} state changed to ${toggled.is_active ? 'ACTIVE' : 'DRAFT/DISABLED'}.`,
          actorName: 'Manager',
          actorRole: 'MANAGER',
          severity: 'INFO',
          metadata: { id: toggled.id, is_active: toggled.is_active }
        },
        io
      );

      res.json(toggled);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Delete offer
  router.delete('/:id', (req, res) => {
    try {
      const result = OfferService.deleteOffer(req.params.id);
      io?.emit('offers:updated', { type: 'DELETED', id: req.params.id });

      ActivityLogger.logActivity(
        {
          category: 'OFFER',
          action: 'OFFER_DELETED',
          title: `Offer #${req.params.id} Deleted`,
          description: `Manager removed promotional offer #${req.params.id}.`,
          actorName: 'Manager',
          actorRole: 'MANAGER',
          severity: 'WARNING',
          metadata: { id: req.params.id }
        },
        io
      );

      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Validate offer at checkout/billing (Backend Source of Truth)
  const handleValidation = (req, res) => {
    try {
      const { offerId, offerCode, subtotal, items } = req.body;
      let targetId = offerId;
      if (!targetId && offerCode) {
        const all = OfferService.getAllOffers();
        const found = all.find(o => o.title.toLowerCase().includes(String(offerCode).toLowerCase()) || String(o.id) === String(offerCode));
        if (found) targetId = found.id;
      }
      const validation = OfferService.validateOfferForBilling(targetId, subtotal, items);
      res.json(validation);
    } catch (err) {
      res.status(400).json({ error: err.message, valid: false });
    }
  };

  router.post('/validate', handleValidation);
  router.post('/validate-billing', handleValidation);

  return router;
}
