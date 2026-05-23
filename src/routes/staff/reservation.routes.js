const express = require("express");
const reservationController = require("../../controllers/staff/reservation.controller");
const { validateReservationCheckIn, validateReservationExpire } = require("../../validators/staff.validator");

const router = express.Router();

router.post("/:code/check-in", validateReservationCheckIn, reservationController.checkInReservation);
router.patch("/:id/expire", validateReservationExpire, reservationController.expireReservation);

module.exports = router;