<?php

namespace App\Exceptions\ClientManagement;

use RuntimeException;

class ClientManagementActionException extends RuntimeException
{
    public function __construct(string $message, private readonly int $statusCode = 400)
    {
        parent::__construct($message);
    }

    public function statusCode(): int
    {
        return $this->statusCode;
    }
}
