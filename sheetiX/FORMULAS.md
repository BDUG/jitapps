# sheetiX formula reference

Use **Functions** beside the formula bar or **Formula guide** to search by name, purpose or category. **Use example** places an editable draft in the formula bar; press Enter to apply it. Type `=SU` to see completion suggestions. Use Up/Down and Enter/Tab to insert a function, or Escape to dismiss suggestions.

Formulas support cell/range references, quoted cross-sheet names, `$` anchors, arithmetic and comparisons, `&` concatenation, percentage expressions (`5%`) and comma or semicolon argument separators. Function names are case-insensitive. Each function returns one cell value; ranges are inputs, not spilled results.

## Statistics

### SUM

`SUM(value1, …)`

Add numeric values.

Example: `=SUM(A1:A10)`

### AVERAGE

`AVERAGE(value1, …)`

Mean of numeric values.

Example: `=AVERAGE(A1:A10)`

### MIN

`MIN(value1, …)`

Smallest numeric value.

Example: `=MIN(A1:A10)`

### MAX

`MAX(value1, …)`

Largest numeric value.

Example: `=MAX(A1:A10)`

### COUNT

`COUNT(value1, …)`

Count numeric values.

Example: `=COUNT(A1:A10)`

### PRODUCT

`PRODUCT(value1, …)`

Multiply numeric values.

Example: `=PRODUCT(A1:A10)`

### SUMSQ

`SUMSQ(value1, …)`

Sum of squared numeric values.

Example: `=SUMSQ(A1:A10)`

### MEDIAN

`MEDIAN(value1, …)`

Middle numeric value.

Example: `=MEDIAN(A1:A10)`

### COUNTA

`COUNTA(value1, …)`

Count nonempty values; formula-produced empty text counts.

Example: `=COUNTA(A1:A10)`

### COUNTBLANK

`COUNTBLANK(range)`

Count blanks and empty text.

Example: `=COUNTBLANK(A1:A10)`

### LARGE

`LARGE(range, k)`

Return the kth largest or smallest number.

Example: `=LARGE(A1:A10, 2)`

### SMALL

`SMALL(range, k)`

Return the kth largest or smallest number.

Example: `=SMALL(A1:A10, 2)`

### VAR.S

`VAR.S(value1, …)`

Sample (.S) or population (.P) variance/standard deviation.

Example: `=VAR.S(A1:A10)`

### VAR.P

`VAR.P(value1, …)`

Sample (.S) or population (.P) variance/standard deviation.

Example: `=VAR.P(A1:A10)`

### STDEV.S

`STDEV.S(value1, …)`

Sample (.S) or population (.P) variance/standard deviation.

Example: `=STDEV.S(A1:A10)`

### STDEV.P

`STDEV.P(value1, …)`

Sample (.S) or population (.P) variance/standard deviation.

Example: `=STDEV.P(A1:A10)`

### SUMPRODUCT

`SUMPRODUCT(range1, range2, …)`

Sum products of corresponding, equally shaped ranges. Text is zero.

Example: `=SUMPRODUCT(A1:A10, B1:B10)`

## Logic

### IF

`IF(test, value_if_true, [value_if_false])`

Evaluate only the selected result; handle errors with IFERROR or IFNA.

Example: `=IF(A1>0, "Positive", "Other")`

### IFS

`IFS(test1, value1, …)`

Evaluate only the selected result; handle errors with IFERROR or IFNA.

Example: `=IFS(A1>90, "A", A1>70, "B", TRUE, "C")`

### IFERROR

`IFERROR(value, fallback)`

Evaluate only the selected result; handle errors with IFERROR or IFNA.

Example: `=IFERROR(A1/B1, 0)`

### IFNA

`IFNA(value, fallback)`

Evaluate only the selected result; handle errors with IFERROR or IFNA.

Example: `=IFNA(MATCH("Item", A1:A10, 0), "Missing")`

### AND

`AND(test1, …)`

Combine logical tests. Text and blanks in ranges are ignored.

Example: `=AND(A1>0, B1<100)`

### OR

`OR(test1, …)`

Combine logical tests. Text and blanks in ranges are ignored.

Example: `=OR(A1>0, B1<100)`

### XOR

`XOR(test1, …)`

Combine logical tests. Text and blanks in ranges are ignored.

Example: `=XOR(A1>0, B1<100)`

### NOT

`NOT(test)`

Invert a logical test.

Example: `=NOT(A1=0)`

### TRUE

`TRUE()`

Logical constant.

Example: `=TRUE()`

### FALSE

`FALSE()`

Logical constant.

Example: `=FALSE()`

## Conditional

### SUMIF

`SUMIF(range, criteria, [result_range])`

Match numbers, comparisons or case-insensitive text; * and ? are wildcards, ~ escapes them.

Example: `=SUMIF(A1:A10, ">=10")`

### COUNTIF

`COUNTIF(range, criteria)`

Match numbers, comparisons or case-insensitive text; * and ? are wildcards, ~ escapes them.

Example: `=COUNTIF(A1:A10, ">=10")`

### AVERAGEIF

`AVERAGEIF(range, criteria, [result_range])`

Match numbers, comparisons or case-insensitive text; * and ? are wildcards, ~ escapes them.

Example: `=AVERAGEIF(A1:A10, ">=10")`

### SUMIFS

`SUMIFS(result_range, criteria_range1, criteria1, …)`

Summarize rows matching all criteria; all ranges must have the same shape.

Example: `=SUMIFS(B1:B10, A1:A10, "Open")`

### COUNTIFS

`COUNTIFS(criteria_range1, criteria1, …)`

Summarize rows matching all criteria; all ranges must have the same shape.

Example: `=COUNTIFS(A1:A10, "Open")`

### AVERAGEIFS

`AVERAGEIFS(result_range, criteria_range1, criteria1, …)`

Summarize rows matching all criteria; all ranges must have the same shape.

Example: `=AVERAGEIFS(B1:B10, A1:A10, "Open")`

## Math

### ABS

`ABS(number)`

Calculate abs of a number (angles in radians).

Example: `=ABS(4)`

### INT

`INT(number)`

Calculate int of a number (angles in radians).

Example: `=INT(4)`

### SIGN

`SIGN(number)`

Calculate sign of a number (angles in radians).

Example: `=SIGN(4)`

### SQRT

`SQRT(number)`

Calculate sqrt of a number (angles in radians).

Example: `=SQRT(4)`

### EXP

`EXP(number)`

Calculate exp of a number (angles in radians).

Example: `=EXP(4)`

### LN

`LN(number)`

Calculate ln of a number (angles in radians).

Example: `=LN(4)`

### LOG10

`LOG10(number)`

Calculate log10 of a number (angles in radians).

Example: `=LOG10(4)`

### SIN

`SIN(number)`

Calculate sin of a number (angles in radians).

Example: `=SIN(4)`

### COS

`COS(number)`

Calculate cos of a number (angles in radians).

Example: `=COS(4)`

### TAN

`TAN(number)`

Calculate tan of a number (angles in radians).

Example: `=TAN(4)`

### RADIANS

`RADIANS(number)`

Calculate radians of a number (angles in radians).

Example: `=RADIANS(4)`

### DEGREES

`DEGREES(number)`

Calculate degrees of a number (angles in radians).

Example: `=DEGREES(4)`

### ROUND

`ROUND(number, digits)`

Round halves away from zero, away from zero, or toward zero. Negative digits round before the decimal point.

Example: `=ROUND(-12.345, 2)`

### ROUNDUP

`ROUNDUP(number, digits)`

Round halves away from zero, away from zero, or toward zero. Negative digits round before the decimal point.

Example: `=ROUNDUP(-12.345, 2)`

### ROUNDDOWN

`ROUNDDOWN(number, digits)`

Round halves away from zero, away from zero, or toward zero. Negative digits round before the decimal point.

Example: `=ROUNDDOWN(-12.345, 2)`

### TRUNC

`TRUNC(number, [digits])`

Round halves away from zero, away from zero, or toward zero. Negative digits round before the decimal point.

Example: `=TRUNC(-12.345, 2)`

### MOD

`MOD(number, divisor)`

Remainder with the divisor’s sign.

Example: `=MOD(-5, 3)`

### POWER

`POWER(number, exponent)`

Raise a number to a power.

Example: `=POWER(2, 3)`

### PI

`PI()`

The mathematical constant pi.

Example: `=PI()`

### LOG

`LOG(number, [base])`

Logarithm; default base is 10.

Example: `=LOG(8, 2)`

### CEILING

`CEILING(number, significance)`

Round to a multiple. Positive significance supports negative numbers; opposite negative significance is invalid.

Example: `=CEILING(12.3, 0.5)`

### FLOOR

`FLOOR(number, significance)`

Round to a multiple. Positive significance supports negative numbers; opposite negative significance is invalid.

Example: `=FLOOR(12.3, 0.5)`

## Text

### CONCAT

`CONCAT(text1, …)`

Join text, numbers and flattened ranges.

Example: `=CONCAT(A1, " ", B1)`

### CONCATENATE

`CONCATENATE(text1, …)`

Join text, numbers and flattened ranges.

Example: `=CONCATENATE(A1, " ", B1)`

### TEXTJOIN

`TEXTJOIN(delimiter, ignore_empty, text1, …)`

Join text and ranges with a delimiter.

Example: `=TEXTJOIN(", ", TRUE, A1:A10)`

### LEN

`LEN(text)`

Return len text information or transformation.

Example: `=LEN(A1)`

### LOWER

`LOWER(text)`

Return lower text information or transformation.

Example: `=LOWER(A1)`

### UPPER

`UPPER(text)`

Return upper text information or transformation.

Example: `=UPPER(A1)`

### PROPER

`PROPER(text)`

Return proper text information or transformation.

Example: `=PROPER(A1)`

### TRIM

`TRIM(text)`

Return trim text information or transformation.

Example: `=TRIM(A1)`

### CLEAN

`CLEAN(text)`

Return clean text information or transformation.

Example: `=CLEAN(A1)`

### LEFT

`LEFT(text, [count])`

Extract characters from the start or end; default one character.

Example: `=LEFT(A1, 3)`

### RIGHT

`RIGHT(text, [count])`

Extract characters from the start or end; default one character.

Example: `=RIGHT(A1, 3)`

### MID

`MID(text, start, count)`

Extract text at a one-based position.

Example: `=MID(A1, 2, 3)`

### REPLACE

`REPLACE(text, start, count, new_text)`

Replace a positional text segment.

Example: `=REPLACE(A1, 1, 3, "New")`

### SUBSTITUTE

`SUBSTITUTE(text, old_text, new_text, [occurrence])`

Replace all matches, or one numbered occurrence. Case-sensitive.

Example: `=SUBSTITUTE(A1, "old", "new")`

### FIND

`FIND(find_text, within_text, [start])`

One-based match position. FIND is case-sensitive; SEARCH supports wildcards.

Example: `=FIND("item", A1)`

### SEARCH

`SEARCH(find_text, within_text, [start])`

One-based match position. FIND is case-sensitive; SEARCH supports wildcards.

Example: `=SEARCH("item", A1)`

### EXACT

`EXACT(text1, text2)`

Case-sensitive text comparison.

Example: `=EXACT(A1, B1)`

### REPT

`REPT(text, count)`

Repeat text, up to 32,000 output characters.

Example: `=REPT("*", 5)`

### VALUE

`VALUE(text)`

Convert a decimal/scientific numeric string or percentage to a number.

Example: `=VALUE("12.5%")`

## Lookup

### INDEX

`INDEX(range, row, [column])`

One-based row and column lookup; returns a single value.

Example: `=INDEX(A1:C10, 2, 3)`

### MATCH

`MATCH(value, range, [match_type])`

Position in a single row/column. 0 exact/wildcard; 1 ascending (default), -1 descending approximate.

Example: `=MATCH("Item", A1:A10, 0)`

### VLOOKUP

`VLOOKUP(value, table, result_index, [approximate])`

Search first column/row. FALSE selects exact/wildcard matching; TRUE requires ascending sort.

Example: `=VLOOKUP("Item", A1:C10, 3, FALSE)`

### HLOOKUP

`HLOOKUP(value, table, result_index, [approximate])`

Search first column/row. FALSE selects exact/wildcard matching; TRUE requires ascending sort.

Example: `=HLOOKUP("Item", A1:C10, 3, FALSE)`

### XLOOKUP

`XLOOKUP(value, lookup_range, result_range, [if_not_found])`

Exact case-insensitive lookup in equally sized vectors, with a lazy optional fallback.

Example: `=XLOOKUP("Item", A1:A10, B1:B10, "Missing")`

### CHOOSE

`CHOOSE(index, value1, …)`

Return one selected value without evaluating other choices.

Example: `=CHOOSE(2, "Small", "Medium", "Large")`

### ROWS

`ROWS(range)`

Count rows or columns in a range.

Example: `=ROWS(A1:C10)`

### COLUMNS

`COLUMNS(range)`

Count rows or columns in a range.

Example: `=COLUMNS(A1:C10)`

### ROW

`ROW([reference])`

One-based row or column of a reference, or the formula cell.

Example: `=ROW(B3)`

### COLUMN

`COLUMN([reference])`

One-based row or column of a reference, or the formula cell.

Example: `=COLUMN(B3)`

## Information

### ISNUMBER

`ISNUMBER(value)`

Test value type, a genuinely blank cell, or a spreadsheet error.

Example: `=ISNUMBER(A1)`

### ISTEXT

`ISTEXT(value)`

Test value type, a genuinely blank cell, or a spreadsheet error.

Example: `=ISTEXT(A1)`

### ISLOGICAL

`ISLOGICAL(value)`

Test value type, a genuinely blank cell, or a spreadsheet error.

Example: `=ISLOGICAL(A1)`

### ISBLANK

`ISBLANK(value)`

Test value type, a genuinely blank cell, or a spreadsheet error.

Example: `=ISBLANK(A1)`

### ISERROR

`ISERROR(value)`

Test value type, a genuinely blank cell, or a spreadsheet error.

Example: `=ISERROR(A1)`

### ISNA

`ISNA(value)`

Test value type, a genuinely blank cell, or a spreadsheet error.

Example: `=ISNA(A1)`

### NA

`NA()`

Return the missing-value error #N/A.

Example: `=NA()`

## Date

### DATE

`DATE(year, month, day)`

Excel 1900-system serial date; months/days normalize, years 0–1899 add 1900.

Example: `=DATE(2026, 10, 25)`

### DATEVALUE

`DATEVALUE(iso_date)`

Convert YYYY-MM-DD text to a serial date.

Example: `=DATEVALUE("2026-10-25")`

### YEAR

`YEAR(date)`

Extract a field from a serial date or ISO date text.

Example: `=YEAR(DATE(2026, 10, 25))`

### MONTH

`MONTH(date)`

Extract a field from a serial date or ISO date text.

Example: `=MONTH(DATE(2026, 10, 25))`

### DAY

`DAY(date)`

Extract a field from a serial date or ISO date text.

Example: `=DAY(DATE(2026, 10, 25))`

### DAYS

`DAYS(end_date, start_date)`

Whole calendar days between dates.

Example: `=DAYS("2026-12-31", "2026-01-01")`

### EDATE

`EDATE(date, months)`

Shift by months, clamping to month end; EOMONTH returns month end.

Example: `=EDATE("2026-01-31", 1)`

### EOMONTH

`EOMONTH(date, months)`

Shift by months, clamping to month end; EOMONTH returns month end.

Example: `=EOMONTH("2026-01-31", 1)`

### WEEKDAY

`WEEKDAY(date, [return_type])`

Weekday: 1 = Sunday 1–7, 2 = Monday 1–7, 3 = Monday 0–6.

Example: `=WEEKDAY("2026-10-25", 2)`

### TODAY

`TODAY()`

Current UTC date/time as an Excel serial; refreshed when the workbook recalculates.

Example: `=TODAY()`

### NOW

`NOW()`

Current UTC date/time as an Excel serial; refreshed when the workbook recalculates.

Example: `=NOW()`

## Finance

### PMT

`PMT(rate, periods, present_value, [future_value], [type])`

Constant-rate cash flow. type 0=end (default), 1=beginning; cash paid/received uses opposite signs.

Example: `=PMT(5%/12, 120, 10000)`

### FV

`FV(rate, periods, payment, [present_value], [type])`

Constant-rate cash flow. type 0=end (default), 1=beginning; cash paid/received uses opposite signs.

Example: `=FV(5%/12, 120, -100)`

### PV

`PV(rate, periods, payment, [future_value], [type])`

Constant-rate cash flow. type 0=end (default), 1=beginning; cash paid/received uses opposite signs.

Example: `=PV(5%/12, 120, -100)`

### NPV

`NPV(rate, value1, …)`

Net present value of end-of-period cash flows; add an initial investment separately.

Example: `=NPV(10%, A1:A5)`

## Semantics and limits

- This is a documented subset of Excel functions, not full Excel compatibility. Named ranges, external workbook links, macros, array constants, omitted argument placeholders and dynamic/spilled arrays are unsupported. A recognized `_xlfn.` prefix on supported functions is accepted on import.
- Numeric aggregates ignore text and logical values; use VALUE to convert numeric text explicitly. COUNT counts numbers, COUNTA counts nonblank cells (including formula-produced empty text and errors), and COUNTBLANK includes empty text. Ordinary calculations propagate errors; IFERROR and IFNA evaluate their fallback only when needed. Circular dependencies and calculation limits remain errors.
- IF, IFS and CHOOSE evaluate only the selected result. AND, OR and XOR evaluate all arguments.
- Conditional range pairs and SUMPRODUCT inputs must have identical dimensions. Criteria support comparisons and case-insensitive wildcards: * matches any text, ? one character, and ~ escapes a wildcard.
- MATCH uses 0 for exact/wildcard matching; its default 1 requires ascending values and -1 requires descending values. VLOOKUP/HLOOKUP default to approximate ascending matching; use FALSE for exact matching. XLOOKUP supports exact matching and an optional fallback, returning one value from an equally sized vector; additional Excel match/search modes are unsupported.
- Dates use Excel’s 1900 serial system, including serial 60 for 1900-02-29. Date functions also accept ISO YYYY-MM-DD strings. TODAY/NOW use UTC and refresh on workbook recalculation. Date results are numeric serials; dates imported as text remain editable text. Locale-specific date parsing and the 1904 date system are unsupported.
- Financial functions use one constant rate per period and positive period counts. With zero periods, FV returns the negative present value, PV returns the negative future value, and PMT returns #DIV/0!; type is 0 for end-of-period and 1 for beginning. NPV discounts the first cash flow by one period.
- The existing workbook size limits remain 20 sheets, 200 rows × 52 columns per sheet. Parser limits are 1,000 tokens and 100 nesting levels; calculated text is limited to 32,000 characters. Formula results and actual spreadsheet errors are exported as XLSX cached values without converting literal text such as "#N/A" into an error.
