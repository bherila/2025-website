<?php

namespace App\Enums\Finance;

enum LotMatcherAutoTrigger: string
{
    case ParsedDataRebuild = 'parsed_data_rebuild';
    case ParseImport = 'parse_import';
    case RebuildEndpoint = 'rebuild_endpoint';
    case LotsImportCli = 'lots_import_cli';
    case CsvImport = 'csv_import';
    case ManualLotCreate = 'manual_lot_create';
    case ManualLotUpdate = 'manual_lot_update';
    case ManualLotDelete = 'manual_lot_delete';
    case LotImportEndpoint = 'lot_import_endpoint';
    case AnalyzerLotsSave = 'analyzer_lots_save';
    case LotAssignment = 'lot_assignment';
}
