export type Form4952Facts = {
investmentInterestSources: Array<TaxFactSource>;
investmentExpenseSources: Array<TaxFactSource>;
excludedInvestmentExpenseSources: Array<TaxFactSource>;
totalInvestmentInterestExpense: number;
totalInvestmentExpenses: number;
totalExcludedInvestmentExpenses: number;
grossInvestmentIncomeFromScheduleB: number;
grossInvestmentIncomeFromK1: number;
grossInvestmentIncomeTotal: number;
netInvestmentIncomeBeforeQualifiedDividendElection: number;
totalQualifiedDividends: number;
deductibleInvestmentInterestExpense: number;
disallowedCarryforward: number;
};
export type Schedule1Facts = {
line5Sources: Array<TaxFactSource>;
line8zSources: Array<TaxFactSource>;
line5Total: number;
line8zTotal: number;
line9TotalOtherIncome: number;
};
export type ScheduleBFacts = {
interestSources: Array<TaxFactSource>;
ordinaryDividendSources: Array<TaxFactSource>;
qualifiedDividendSources: Array<TaxFactSource>;
directInterestTotal: number;
k1InterestTotal: number;
interestTotal: number;
directOrdinaryDividendTotal: number;
k1OrdinaryDividendTotal: number;
ordinaryDividendTotal: number;
qualifiedDividendTotal: number;
form4952Line5aTotal: number;
};
export type TaxFactSource = {
id: string;
label: string;
amount: number;
sourceType: string;
taxDocumentId: number | null;
taxDocumentAccountId: number | null;
accountId: number | null;
formType: string | null;
box: string | null;
code: string | null;
routing: string | null;
routingReason: string | null;
notes: string | null;
isReviewed: boolean;
reviewStatus: string;
reviewAction: string | null;
};
export type TaxPreviewFacts = {
year: number;
schedule1: Schedule1Facts;
scheduleB: ScheduleBFacts;
form4952: Form4952Facts;
};
