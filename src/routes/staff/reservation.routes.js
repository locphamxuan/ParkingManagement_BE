const express = require("express");
const reservationController = require("../../controllers/staff/reservation.controller");

const router = express.Router();

router.post("/:code/check-in", reservationController.checkInReservation);
router.patch("/:id/expire", reservationController.expireReservation);

module.exports = router;