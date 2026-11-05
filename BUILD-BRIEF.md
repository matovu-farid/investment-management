# Investment group management system — build brief

This brief captures what was discussed in the two calls with CJ. It is a requirements starting point, not a finalized financial specification. The first recording below continues the discussion in the second; timestamps refer to the named file.

## Purpose and users

Build a system for Rats Network Investment Group (RNIG) and Mera Investment Limited to give members a clear picture of the group and reduce the general manager's spreadsheet and reporting work. Mera Investment Limited was described as the company holding shares for RNIG members. Confirm the exact legal and reporting structure before modeling it. [CJ2 00:13–01:13]

The general manager administers investments, accounts, lending, and reporting. Board members oversee audit and risk, credit, investment policy and performance. Members should be able to log in and view the group's books and investments; editing and operational actions should be limited to authorized people. Agree the detailed permissions with the group. [CJ2 01:20–04:49, 10:54–12:47]

## What to build

### 1. Members, shares and access

- Maintain member records and their shareholdings. Provide an administrator-controlled way to add the existing members during setup; membership is currently closed to new entrants, so registration should be restrictable. There were approximately 51 members at the time of the call. [CJ 00:19–01:02, 35:14–35:25]
- Support role-based access: members can view group information; authorized staff can manage records, loans and other operations. Confirm precisely which information each role can see and change. [CJ2 10:54–12:47]
- Show each member their shares and an indicative current value, with the share price and valuation basis clearly labeled. The group currently determines the member's value through the current share price, but the formula for that price was not established. [CJ 22:35–24:10]
- Record shareholding changes, including member-to-member trades, exits, and bonus issues where applicable. Members were said not to be allowed to sell shares to external parties. [CJ 01:07–02:34, 28:03–28:20]

### 2. Kanungu loan fund

- Record loans exclusively to members, including the borrower, principal, disbursement date, terms, maturity, repayments and outstanding balance. A member may have multiple loans with different dates and maturities: track each separately so consolidating dates does not lose days of interest. [CJ2 07:19–09:16, 13:40–13:45]
- Calculate and track interest and repayment balances per loan. The stated base rate is 10% per year; one call says reducing balance, while the other mentions 5% every six months and twice-yearly compounding but expresses uncertainty about the calculation. **Confirm the actual method, day-count convention, repayment allocation and treatment of partial repayments with the GM before implementing calculations.** Rates may change in future, so avoid assuming every historical loan always has the same rate. [CJ2 13:01–13:33; CJ 03:18–04:24, 06:22–06:40]
- Show a member's borrowing limit and remaining capacity based on shareholding value and existing borrowing. One example says a member can borrow up to their shareholding value, with repayments freeing capacity. A later clarification allows borrowing above that value, with 2% per month on the excess. Confirm eligibility, how multiple loans consume capacity, the valuation date and how the excess rate is applied. [CJ 04:25–05:23, 09:04–09:34, 21:21–22:30]
- Record credit bookings / a waiting list when fund cash is unavailable. Show demand, amounts fulfilled and amounts still waiting, so the GM can report them to the board. Do not assume loans can always be funded immediately. [CJ 06:43–08:34]
- Record pledged shares and support tracking defaults and subsequent share sales. The calls describe members buying the shares, with the group potentially buying them if members do not. The exact accounting, recovery sequence and treatment of unsold shares are unresolved; confirm before automating seizure or settlement. [CJ2 13:51–18:58]

### 3. Investments and investment policy

- Maintain an investment register covering equities, bonds, private equity, the Kanungu loan fund and real-estate activity. Record investments and relevant transactions, dates, amounts, income and current status. The IPS discussion names four classes; real estate is also active, so confirm how it maps to the policy's classifications. [CJ2 04:59–07:18]
- Store or represent the investment policy statement (IPS), including asset classes and target allocations. Compare actual portfolio allocation with the policy and the annual budget so the GM and board can monitor deployment and risk. Confirm allocation percentages, calculation basis and the desired thresholds or alerts. [CJ2 02:36–02:55, 05:03–06:17, 10:18–10:43]
- Track investment cost alongside a dated current or market valuation and show appreciation or depreciation separately. The existing IPS tracker compares cost and market value, with gains and losses shown visually. Make the basis and date explicit; do not present an estimate as realizable cash. [CJ 16:27–17:15, 18:17–20:21]
- Record cash income such as dividends, rent, bond income, loan interest and private-equity income as applicable. Confirm actual transaction categories and accounting treatment with the GM. [CJ 17:20–18:11]

### 4. Share sales and trading visibility

- Give members a view of shareholdings and trading activity, including trade date, price and transaction amount. A trading view was suggested; the call does not establish that payment or transfers must be executed automatically. [CJ 02:10–02:51]
- Support the GM's existing sale process: record a member's request, notify or keep the board informed, announce the number of shares and asking price to members without identifying the seller, record bids or purchase interest, and close or extend the sale period. The discussion describes allocation as first come, first served; confirm the exact auction and allocation rules. [CJ 24:30–26:19]
- Record sales to other members and, where applicable, sales back to the group at the group's conservative price. Distinguish this price from the seller's asking price and trade price. Confirm settlement, partial sales, liquidity and approvals before automating transactions. [CJ 26:20–26:48]

### 5. Reporting and financial visibility

- Give authorized users an overview of members, shareholdings, investments, loans, fund availability and portfolio allocation. Show members the information the group agrees should be open to them. [CJ2 09:16–10:10, 12:17–12:47]
- Generate periodic reports and board-pack inputs from recorded data, including portfolio/IPS performance, budget versus actual, loan balances and credit bookings. The group described three board meetings a year, every four months; quarterly or three-month reports were also mentioned. Make the reporting period selectable and confirm the actual reporting calendar. [CJ2 04:06–04:37, 09:16–09:40; CJ 07:34–08:12]
- Support the financial statements and cash income/expense reporting the GM currently prepares. The group described recording assets at cost and recognizing cash received and paid, with market values and unrealized gains tracked separately. The speakers were uncertain about the precise accounting terminology and treatment. Use the GM's actual statements and accounting rules as the specification; do not infer IFRS compliance or a complete accounting model from the call. [CJ 10:39–11:47, 14:22–15:03, 18:42–20:21]

## Key workflows to validate

1. **A member borrows:** verify membership, share value, existing exposure and fund availability; record each approved loan and its individual terms; track repayment and interest over time. Confirm approval and excess-borrowing rules.
2. **Cash is unavailable:** record the credit booking, track its outstanding amount and update fulfillment as funds become available. Confirm ordering and partial-fulfillment rules.
3. **A member sells shares:** the GM records the request and informs the board, announces an anonymous sale to members, records interest and completed trades, and updates ownership. Confirm who approves and how settlement is evidenced.
4. **A loan defaults:** identify pledged shares and record the outcome of the agreed recovery process. Obtain the GM's written rules before implementing financial or ownership changes.
5. **A reporting period ends:** the GM selects the period and prepares a board pack using recorded financial, investment, policy and lending data; the board reviews it.

These are workflow descriptions derived from the discussion; approval steps and automation boundaries still need agreement.

## Questions for the general manager and board

1. What are the exact loan formulas: reducing balance, compounding frequency, day-count, rounding, due dates, payment allocation, late payments and rate changes? Are 5% per six months and 10% per year nominal or effective rates?
2. How is the group's conservative share price calculated and updated? Which price determines collateral, borrowing capacity and a member's displayed value? How are unrealized gains treated on exit?
3. How is borrowing above share value approved, secured and calculated? Is 2% per month charged only on the excess, and how does the excess change after repayments or share-price changes?
4. What are the default triggers and approval steps? How are shares valued, transferred and sold, and how are sale proceeds applied? What happens if nobody buys the shares or proceeds do not cover the debt?
5. What are the exact trading rules: first-come allocation versus bidding, partial fills, deadlines, anonymity, settlement, board notification and group buybacks?
6. Which roles can view personal loans, individual holdings, member identities, transactions and financial reports? Who can create or change each kind of record?
7. What is the authoritative IPS, its target allocations, its asset classification for property, and the basis for allocation and risk calculations?
8. What reports and periods are required? Are the three four-monthly board meetings separate from quarterly reports? Which financial statement conventions and adjustments are actually used?
9. What source data and opening balances are available, and who will validate imported members, shares, loans, investments and historical transactions?

## Source materials to obtain

CJ offered or discussed sharing the current shareholding register, IPS tracker, latest financial report (including balance sheet and income statement), IPO material and meeting minutes. Obtain those documents and the GM's loan spreadsheets and credit-booking records before finalizing calculations, migration and report layouts. [CJ 20:31–21:00, 28:03–28:30, 30:53–32:21; CJ2 08:13–09:10]

## Source recordings

- **CJ:** `Call with CJ.m4a` — approximately 35 minutes 41 seconds; a continuation of CJ2.
- **CJ2:** `Call with CJ2.m4a` — approximately 19 minutes 22 seconds; ends during a collateral example.

The brief was derived from automated transcripts. Names, financial terminology and any ambiguous figures should be checked against the recordings and the GM's source documents.
