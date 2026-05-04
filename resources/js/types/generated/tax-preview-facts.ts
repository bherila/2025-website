export type Form4952Facts = {
investmentInterestSources: Array<TaxFactSource>;
investmentExpenseSources: Array<TaxFactSource>;
totalInvestmentInterestExpense: number;
totalInvestmentExpenses: number;
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
};
export type TaxPreviewFacts = {
year: number;
schedule1: Schedule1Facts;
form4952: Form4952Facts;
};
