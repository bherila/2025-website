FROM mcr.microsoft.com/devcontainers/php:8.5-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    COMPOSER_ALLOW_SUPERUSER=1 \
    COMPOSER_NO_INTERACTION=1 \
    XDEBUG_MODE=off

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        default-mysql-client \
        git \
        jq \
        libfreetype6-dev \
        libjpeg-dev \
        libpng-dev \
        libsqlite3-dev \
        libwebp-dev \
        libzip-dev \
        ripgrep \
        unzip \
        zip \
        zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://github.com/mlocati/docker-php-extension-installer/releases/latest/download/install-php-extensions \
        -o /usr/local/bin/install-php-extensions \
    && chmod +x /usr/local/bin/install-php-extensions \
    && install-php-extensions bcmath exif gd intl pcntl pdo_mysql pdo_sqlite zip
