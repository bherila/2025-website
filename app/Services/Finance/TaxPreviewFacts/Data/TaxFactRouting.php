<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

enum TaxFactRouting: string
{
    case DefaultSchedule18z = 'default_schedule_1_8z';
    case ExcludedForm4952Line5 = 'excluded_form_4952_line_5';
    case Form1040Line3a = 'form_1040_line_3a';
    case Form1116Line1a = 'form_1116_line_1a';
    case Form1116Line4b = 'form_1116_line_4b';
    case Form1116Line8 = 'form_1116_line_8';
    case Form1116SourcedByPartner = 'form_1116_sourced_by_partner';
    case Form4952Line1 = 'form_4952_line_1';
    case Form8960Line1 = 'form_8960_line_1';
    case Form8960Line2 = 'form_8960_line_2';
    case Form8960Line4a = 'form_8960_line_4a';
    case Form8960Line5a = 'form_8960_line_5a';
    case Form8960Line9a = 'form_8960_line_9a';
    case NeedsReviewScheduleDLine5Or12 = 'needs_review_schedule_d_line_5_or_12';
    case Schedule1Line5 = 'schedule_1_line_5';
    case ScheduleALine5a = 'schedule_a_line_5a';
    case ScheduleALine5b = 'schedule_a_line_5b';
    case ScheduleALine5c = 'schedule_a_line_5c';
    case ScheduleALine6 = 'schedule_a_line_6';
    case ScheduleALine8a = 'schedule_a_line_8a';
    case ScheduleALine9 = 'schedule_a_line_9';
    case ScheduleALine11 = 'schedule_a_line_11';
    case ScheduleALine12 = 'schedule_a_line_12';
    case ScheduleALine16 = 'schedule_a_line_16';
    case ScheduleALine17 = 'schedule_a_line_17';
    case ScheduleBLine1 = 'schedule_b_line_1';
    case ScheduleBLine5 = 'schedule_b_line_5';
    case ScheduleDLine3 = 'schedule_d_line_3';
    case ScheduleDLine5 = 'schedule_d_line_5';
    case ScheduleDLine10 = 'schedule_d_line_10';
    case ScheduleDLine12 = 'schedule_d_line_12';
    case ScheduleDLine13 = 'schedule_d_line_13';
    case ScheduleELine3 = 'schedule_e_line_3';
    case ScheduleELine28 = 'schedule_e_line_28';
    case ScheduleELine32 = 'schedule_e_line_32';
    case Schedule1LegacyLine8 = 'sch_1_line_8';
    case Schedule1Line8b = 'sch_1_8b';
    case Schedule1Line8h = 'sch_1_8h';
    case Schedule1Line8i = 'sch_1_8i';
    case Schedule1Line8z = 'sch_1_8z';
}
