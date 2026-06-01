<?php

return [
    'stripe' => [
        'max_amount_cents' => 100000,
    ],

    /*
     * Recipient for proposal action notifications (accept / reject / request
     * changes / sent). Sent through the default mailer (Brevo failover).
     */
    'proposal_notification_email' => env('CLIENT_MGMT_PROPOSAL_NOTIFICATION_EMAIL', 'ben@herila.net'),
];
