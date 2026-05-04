<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

enum TaxFactRouting: string
{
    case DefaultSchedule18z = 'default_schedule_1_8z';
    case ExcludedForm4952Line5 = 'excluded_form_4952_line_5';
    case Form1040Line3a = 'form_1040_line_3a';
    case Form4952Line1 = 'form_4952_line_1';
    case NeedsReviewScheduleDLine5Or12 = 'needs_review_schedule_d_line_5_or_12';
    case Schedule1Line5 = 'schedule_1_line_5';
    case ScheduleBLine1 = 'schedule_b_line_1';
    case ScheduleBLine5 = 'schedule_b_line_5';
    case ScheduleDLine3 = 'schedule_d_line_3';
    case ScheduleDLine5 = 'schedule_d_line_5';
    case ScheduleDLine10 = 'schedule_d_line_10';
    case ScheduleDLine12 = 'schedule_d_line_12';
    case ScheduleDLine13 = 'schedule_d_line_13';
    case Schedule1LegacyLine8 = 'sch_1_line_8';
    case Schedule1Line8b = 'sch_1_8b';
    case Schedule1Line8h = 'sch_1_8h';
    case Schedule1Line8i = 'sch_1_8i';
    case Schedule1Line8z = 'sch_1_8z';
}
