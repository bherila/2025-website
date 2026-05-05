<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

enum TaxFactSourceType: string
{
    case BrokerageMarginInterest = 'brokerage_margin_interest';
    case K1AmbiguousNonportfolioCapitalGain = 'k1_ambiguous_nonportfolio_capital_gain';
    case K1CollectiblesGain = 'k1_collectibles_gain';
    case K1ExcludedInvestmentExpense = 'k1_excluded_investment_expense';
    case K1InterestIncome = 'k1_interest_income';
    case K1InvestmentInterest = 'k1_investment_interest';
    case K1LongTermCapitalGain = 'k1_long_term_capital_gain';
    case K1NonportfolioLongTermCapitalGain = 'k1_nonportfolio_long_term_capital_gain';
    case K1NonportfolioShortTermCapitalGain = 'k1_nonportfolio_short_term_capital_gain';
    case K1OrdinaryDividends = 'k1_ordinary_dividends';
    case K1QualifiedDividends = 'k1_qualified_dividends';
    case K1ScheduleENet = 'k1_schedule_e_net';
    case K1Section1231Gain = 'k1_section_1231_gain';
    case K1Section1256LongTerm = 'k1_section_1256_long_term';
    case K1Section1256ShortTerm = 'k1_section_1256_short_term';
    case K1ShortTermCapitalGain = 'k1_short_term_capital_gain';
    case K1Unrecaptured1250Gain = 'k1_unrecaptured_1250_gain';
    case Form1099DivCapitalGainDistributions = '1099_div_capital_gain_distributions';
    case Form1099DivOrdinaryDividends = '1099_div_ordinary_dividends';
    case Form1099DivQualifiedDividends = '1099_div_qualified_dividends';
    case Form1099IntInterest = '1099_int_interest';
    case Form1099IntInvestmentExpense = '1099_int_investment_expense';
    case Form1099IntTreasuryInterest = '1099_int_treasury_interest';
    case Form1099MiscOtherIncome = '1099_misc_other_income';
    case ShortDividendInvestmentInterest = 'short_dividend_investment_interest';
}
