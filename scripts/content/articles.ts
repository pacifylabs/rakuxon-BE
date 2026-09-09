/**
 * Rakuxon's own guidance, written for this site.
 *
 * Two rules hold everywhere in this file, and both exist because the reader is
 * making an expensive, hard-to-reverse decision on the strength of it:
 *
 * 1. No invented figures. Fees, salary thresholds, maintenance amounts and
 *    processing times change every year and differ by course and by applicant.
 *    Where a number matters, the article names the authority that publishes it
 *    and links there instead of quoting a figure that will be wrong by spring.
 * 2. No claim that only an official source can make. Visa rules are law. An
 *    article can explain the shape of a process and where people lose time;
 *    it cannot tell someone they qualify.
 */

export interface SeedArticle {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  countryCode: string | null;
  tags: string[];
  readMinutes: number;
  publishedAt: string;
}

export const AUTHOR = 'Rakuxon Editorial';

export const ARTICLES: readonly SeedArticle[] = [
  {
    slug: 'how-to-choose-a-university-abroad',
    title: 'How to choose a university abroad',
    excerpt:
      'Rankings answer a question you are not asking. Here is what to compare instead, and the order to compare it in.',
    countryCode: null,
    tags: ['choosing', 'applications'],
    readMinutes: 7,
    publishedAt: '2026-01-14',
    body: `Most people start with a ranking, and a ranking is a poor place to start. League tables mostly measure research output, income and reputation surveys — how much work the institution publishes, and what other academics think of it. None of that is the same question as whether you will finish the degree, afford it, and be employable afterwards.

Those three are the real questions. Take them in that order.

## Will you finish it?

Look at the course page, not the university page. A named degree at two institutions can be two different degrees: different entry requirements, different assessment split between coursework and exams, different amounts of independent study.

Read the module list for every year, including the optional ones. If most of what interests you sits in third-year options that run only when enough students choose them, you are betting on other people's choices. Ask the admissions office how often those modules actually run.

Then look at the entry requirements honestly. Applying slightly above your grades is sensible. Applying far above them, with no backup, is how a year gets lost.

## Can you afford all of it?

Tuition is the number everyone compares and the smaller half of the problem. The full cost is tuition, living costs for the whole course, the visa and its health surcharge where one applies, flights, and a deposit before you have any funding confirmed.

Living costs vary more between cities than tuition varies between universities. A cheaper course in an expensive city routinely costs more than the reverse.

Ask three specific questions before you commit:

- What is tuition in **each** year? Some rise annually, and the increase is often in the terms rather than the prospectus.
- What is required before enrolment, and when? A deposit due in June is a different problem from one due in September.
- What scholarships exist for your nationality and subject, and what is the deadline? Many close before the course application does, which means the money is gone before most applicants know it existed.

## What happens after graduation?

Two things decide this, and only one is about the university.

The first is post-study work rights, which are set by the country, not the institution — and they change. Check the immigration authority's own pages for the country you are considering, and check them again in the term you apply.

The second is where that department's graduates actually go. Careers services publish outcomes data. Alumni are findable on LinkedIn. Ten minutes there tells you more about a department than any ranking position.

## A practical shortlist

Five to eight courses, sorted into three groups: two you are comfortably qualified for, three or four that match your grades, one or two ambitious. Apply to all of them in the same window. A shortlist built entirely from the ambitious group is not a shortlist; it is a single bet with extra admin.`,
  },
  {
    slug: 'personal-statement-that-is-about-you',
    title: 'Writing a personal statement that is actually about you',
    excerpt:
      'Admissions tutors read thousands of these. The ones that work are specific, and specificity is the only thing that cannot be borrowed.',
    countryCode: null,
    tags: ['applications', 'writing'],
    readMinutes: 6,
    publishedAt: '2026-01-28',
    body: `An admissions tutor reads hundreds of statements for one course in one season. By the fiftieth, the sentences that appear in all of them have stopped carrying information. "I have always been passionate about engineering" is true of every applicant and evidence about none of them.

What survives that reading is detail that could only have come from you.

## Lead with the specific thing

Not the childhood memory. The most recent, most concrete piece of work you have done in the subject.

Compare:

> From a young age I have been fascinated by the human body and dreamed of a career in medicine.

with:

> I spent six weeks on a hospital ward in Lagos taking blood pressures, and learned that most of the job is explaining the same thing four times to a frightened person.

The second tells the reader you have seen the work, and that you noticed something about it. The first could be pasted into any application in the pile.

## Show the reasoning, not just the reading

Naming a book you read is a weak signal — anyone can name a book. What you disagreed with in it is a strong one, because it cannot be faked by someone who did not read it.

The same is true of every activity. A prize proves an outcome. What you would do differently proves judgement, and judgement is the thing a department is actually selecting for.

## Structure that holds up

Four movements, roughly:

1. **Why this subject** — the specific encounter, not the origin story.
2. **What you have done about it** — study, work, reading, projects. Evidence.
3. **What you learned that was not on the syllabus** — the part only you can write.
4. **Why this course** — named modules, named research, named reasons.

The fourth section is where most statements fail. "Your excellent reputation" is not a reason; every applicant to every university writes it. A module title, a lab, a specific staff member's work — those are reasons, and they also prove you read the course page.

## Before you send it

Cut every sentence that would still be true if you deleted your name from the document. Ask someone who does not know the subject to read it: they should be able to tell you what you want to study and why, from the text alone, without asking.

Where you are applying to several institutions, write the first three sections once and rewrite the fourth for every course. Different words, not the same paragraph with the university's name swapped. Tutors can tell, and it is the one part of the statement addressed directly to them.`,
  },
  {
    slug: 'proof-of-funds-for-student-visas',
    title: 'Proof of funds: what caseworkers are actually checking',
    excerpt:
      'Most financial refusals are not about having too little money. They are about the wrong document, the wrong dates, or an account that moved.',
    countryCode: null,
    tags: ['visas', 'finance'],
    readMinutes: 6,
    publishedAt: '2026-02-11',
    body: `The financial requirement is the most mechanical part of a student visa application, which is why so many refusals come from it. A caseworker is not judging whether you are good for the money. They are checking that a specific document says specific things, and a balance that fails on a technicality fails just as completely as no balance at all.

The exact amounts and the accepted document types are set by each country's immigration authority, they change, and they differ by course, city and length of stay. Take them from the official source for your destination — the UK's UKVI guidance, Canada's IRCC pages, Australia's Department of Home Affairs, and their equivalents elsewhere — as they stand in the month you apply. Nothing here is a substitute for that.

What follows is the shape of the requirement, which changes far more slowly than the numbers.

## Held, not just present

Almost every scheme requires the money to have been held for a continuous period — commonly a number of consecutive days ending shortly before the application. One day below the threshold in the middle of the window usually resets it.

This catches people whose family moves the money between accounts to assemble the total. The total is correct on the day they apply, and the history shows a dip. Consolidate first, then start counting.

## Whose account it is

Funds usually have to be in your name, your parent's, or a legal guardian's. Money in an uncle's account, a family business account, or a friend's is generally not accepted, however genuine.

Where the account belongs to a parent, expect to prove the relationship — a birth certificate — and to provide their written consent to your using the funds. Both are ordinary requirements, and both take longer to obtain than people plan for.

## What the document must state

A statement or letter that omits one required element is treated as not meeting the requirement. Typically it must show the account holder's name, the account number, the bank's name and logo, the balance, the currency, and the date — and be recent, often within about a month of the application.

Screenshots from a banking app are frequently rejected. Ask the bank for a stamped statement or an official letter on headed paper, and ask early: some branches take a fortnight.

## Money that does not count

Balances in accounts you cannot access without notice, overdrafts, credit limits and, in many schemes, funds tied up in fixed deposits maturing after the course starts. Where a loan is accepted, it usually has to be from an approved financial institution and to state that funds are available before travel.

## The order that works

1. Confirm the current requirement for your exact course and city from the official source.
2. Consolidate everything into one qualifying account.
3. Start the holding period, and do not touch the account.
4. Request the stamped statement a few days before you apply — not weeks, or the date will be stale.
5. Have relationship and consent documents ready if the account is not yours.

If a refusal does come, read the letter closely. Financial refusals name the specific failure, and the specific failure is usually fixable in the next application.`,
  },
  {
    slug: 'uk-student-visa-order-of-events',
    title: 'The UK student route, in the order things actually happen',
    excerpt:
      'The steps have dependencies, and the expensive mistakes come from doing them out of sequence.',
    countryCode: 'GB',
    tags: ['visas', 'applications'],
    readMinutes: 7,
    publishedAt: '2026-02-25',
    body: `The UK Student route is well documented and still routinely goes wrong, because the documentation explains each step without making the dependencies obvious. Several steps cannot start until an earlier one finishes, and one of them is slow.

Requirements, fees and the Immigration Health Surcharge are set by UK Visas and Immigration and change — take every figure and every deadline from GOV.UK as it stands when you apply.

## 1. Offer, then unconditional offer

An offer is usually conditional: final results, an English test score, a deposit. None of the later steps can begin while any condition is outstanding. Clear them as soon as each becomes possible rather than in a batch.

## 2. English, if the university asks for it

Not every applicant needs a Secure English Language Test. Many universities accept prior study in English, and some assess it themselves. Ask the admissions team what **they** accept before booking anything: the wrong test is a wasted fee and, more expensively, a wasted month.

If a SELT is required, it must be from an approved provider at an approved centre. A test from the same brand taken at a non-approved centre does not count.

## 3. Deposit, then CAS

The Confirmation of Acceptance for Studies is the document the visa application is built around. Universities issue it only after conditions are met and the deposit is paid, and typically not more than six months before the course starts.

Check every field the moment it arrives — name spelling, passport number, course title, dates, fees paid. An error on the CAS has to be corrected by the university before you apply, and correcting it after you have applied is far worse than waiting two days to correct it before.

## 4. Funds, held and evidenced

The maintenance requirement depends on where you will study and for how long, and money paid to the university already appears on the CAS. The holding period is the part that catches people — see our guidance on [proof of funds](/resources/proof-of-funds-for-student-visas). Start it before you have the CAS, not after; there is no reason to wait, and waiting adds weeks.

## 5. Tuberculosis test, where required

Required for applicants resident in certain countries, at approved clinics only. Certificates have a validity period, and the clinics have queues. Book this in parallel with everything else, not after the CAS.

## 6. Apply, pay the surcharge, give biometrics

The application is online. The Immigration Health Surcharge is paid as part of it and covers NHS access for the length of your leave. Biometrics are given at a visa application centre or, for some passports, through the ID Check app.

## 7. Decision

Processing times are published by UKVI per country and vary considerably by season. Applications submitted in the same fortnight in August as everyone else's take longer than the same application in June.

## The two mistakes that cost the most

**Booking flights before the decision.** A refusal or a delay turns a cheap ticket into an expensive one.

**Leaving the CAS to the last available week.** Every step downstream of it inherits the delay, and the course start date does not move.`,
  },
  {
    slug: 'canada-study-permit-beyond-the-letter-of-acceptance',
    title: 'Canada: what the letter of acceptance does not cover',
    excerpt:
      'A study permit is not the offer. Provincial attestation, designated institutions and proof of ties are separate hurdles.',
    countryCode: 'CA',
    tags: ['visas', 'applications'],
    readMinutes: 6,
    publishedAt: '2026-03-10',
    body: `An acceptance letter from a Canadian institution is necessary and not sufficient. The study permit is a separate decision made by Immigration, Refugees and Citizenship Canada against criteria the university has no say over — and Canada's requirements have changed materially in recent years, more than once.

Everything below is structure, not law. Confirm the current rules on IRCC's own pages before acting on any of it, because this is an area where guidance written a year ago is frequently wrong.

## Designated learning institutions

A study permit requires an offer from a designated learning institution. Not every school in Canada is one, and designation can be withdrawn. IRCC publishes the list; check your institution appears on it before paying a deposit.

## Provincial or territorial attestation

Most study permit applications now require an attestation letter issued by the province or territory where you will study, on top of the acceptance letter. The institution normally requests it on your behalf, but processing times are provincial and vary, and some categories of applicant are exempt.

Ask your institution, in writing, whether you need one and when they expect to have it. This is the step most likely to be the reason an otherwise complete application is not yet ready.

## Funds, and the difference from other countries

You must show you can pay tuition and support yourself — and the required amount is reviewed periodically. The important structural point is that it is separate from and additional to your first year's tuition.

Accepted evidence includes a Guaranteed Investment Certificate, which is how many applicants demonstrate the living-cost portion. GICs take time to open from outside Canada. Start early.

## Ties, and why applications are refused

The most common refusal ground is not money. It is that the officer is not satisfied you will leave at the end of your authorised stay.

This is judged on the whole picture: whether the course makes sense given your prior study and work, family and property at home, and whether your stated plans are coherent. A letter of explanation that connects your background to this specific programme and to what you intend afterwards addresses this directly. A generic one does not.

Where a career change is genuine, say so and explain it. An unexplained jump from an accounting degree to a diploma in hospitality reads as a permit application rather than a study plan; the same jump with a clear reason reads as a career.

## Working, during and after

Study permits carry conditions on working during term, and those conditions have been tightened and loosened more than once — check the current position rather than what a forum said last year.

Post-graduation work permit eligibility depends on the institution, the credential and the field of study, and the rules have narrowed for certain programmes. If your plan after graduating depends on a PGWP, verify eligibility for **your specific programme** before you accept the offer, not after.`,
  },
  {
    slug: 'ireland-for-postgraduate-study',
    title: 'Ireland for postgraduate study',
    excerpt:
      'One-year masters, English-speaking, in the EU. What that combination is good for, and what it costs in practice.',
    countryCode: 'IE',
    tags: ['postgraduate', 'choosing'],
    readMinutes: 5,
    publishedAt: '2026-03-24',
    body: `Ireland occupies a specific niche: English-language teaching, an EU member state, and taught masters degrees that typically run a single year. For someone who wants a European qualification without adding a language and without two years out of work, the combination is genuinely hard to replicate.

It is not the cheap option, and the parts that cost most are not tuition.

## The one-year masters

A taught masters in Ireland is usually twelve months, including a summer dissertation or project. That is one year of tuition and one year of living costs rather than two, which frequently makes it cheaper overall than a nominally cheaper two-year degree elsewhere.

The trade-off is intensity. Twelve months with a dissertation at the end leaves little room for a term spent finding your feet. Applicants coming from a different subject should look hard at whether the programme has a conversion pathway or assumes the background.

## Accommodation is the real constraint

Student housing in Dublin, and increasingly in Cork and Galway, is scarce and expensive. This is the single most common thing arriving students are unprepared for, and it is not a rumour — it is the ordinary experience.

Two consequences worth acting on:

- Apply for university accommodation the day applications open, not the day you accept the offer.
- Budget for the city you will live in, not a national average. The gap between Dublin and elsewhere is large.

If you cannot secure something before you fly, arrive with several weeks of temporary accommodation booked and paid for. Searching from abroad rarely works; searching from a hotel while attending induction does.

## Immigration permission

Non-EEA students need a visa before travelling if their nationality requires one, and separately must register with immigration after arriving to receive residence permission. These are two different steps and both have their own evidence requirements and appointment queues.

Financial evidence, insurance requirements and the current post-study stay arrangements are published by the Irish Naturalisation and Immigration Service and the Department of Justice. Check those directly — Ireland's third-level graduate scheme has been revised, and its length depends on the level of your award.

## Where Ireland is strong

The obvious concentrations are pharmaceuticals, medical devices, agri-food, and the technology and financial-services operations clustered around Dublin. Several universities run programmes designed with those employers, which is worth more than a ranking position if you intend to work in the sector.

Check the specific department rather than the institution. Ireland's universities are small by international standards, and strength is concentrated in particular schools rather than spread evenly.`,
  },
  {
    slug: 'germany-tuition-free-is-not-cost-free',
    title: 'Germany: tuition-free is not cost-free',
    excerpt:
      'Public universities charge little or no tuition. The blocked account, the language requirement and the admissions system are where the effort goes.',
    countryCode: 'DE',
    tags: ['finance', 'choosing'],
    readMinutes: 6,
    publishedAt: '2026-04-07',
    body: `Germany's public universities charge no tuition, or a nominal semester contribution, to international students in most states and at most levels. That is real, and it is the reason Germany appears on so many shortlists.

It is also the least difficult part of studying there. The difficulty is elsewhere, and it is front-loaded.

## The blocked account

Before a student visa is granted you generally have to show a year's living costs in a *Sperrkonto* — a blocked account you can only draw from monthly, at a rate set by the authorities. The required amount is reviewed and has risen repeatedly; take the current figure from the Federal Foreign Office rather than from a blog.

Opening one from outside Germany takes weeks, involves identity verification, and several providers charge a setup and monthly fee. Start it before you have an admission decision if you are confident of one, because the visa appointment queue starts after the account exists.

## Admission is not a single application

There is no one national system covering everything. Some programmes are handled through uni-assist, which evaluates foreign qualifications on behalf of many universities and charges per application. Others apply directly to the university. Some subjects are subject to national or local admission restrictions.

The practical consequence is that "applying to five German universities" can mean five different processes with five different deadlines. Build the list before you write anything, and record each one's route and closing date.

Your school-leaving qualification may also not be directly equivalent to the German *Abitur*. Where it is not, the route is usually a *Studienkolleg* — a preparatory year ending in an assessment examination. Establishing whether you need one is the first question to answer, because it changes the timeline by a year.

## Language, honestly

There are many English-taught masters programmes, and comparatively few English-taught bachelors at public universities. If you are applying at bachelor level, assume German is required unless a specific programme says otherwise, and expect to prove it — typically through TestDaF or the DSH.

Even on an English-taught programme, German decides the quality of the two years. Administration, housing, part-time work and most social life run in German. Students who arrive without it and do not commit to learning it tend to finish the degree and describe the experience as isolating.

## What it costs anyway

No tuition still leaves the semester contribution, health insurance, rent, and the blocked account's monthly ceiling to live within. Rent in Munich, Frankfurt and Hamburg is not meaningfully cheaper than comparable cities elsewhere in Europe; smaller university towns are.

Germany is excellent value. It is not free, and treating it as free is how people arrive underfunded.

## Working and staying

Student visas permit limited work, and after graduating there is a residence permit for job-seeking. Both the permitted hours and the length of the post-study period are set in law and have been amended; verify the current position with the Federal Office for Migration and Refugees before relying on either.`,
  },
  {
    slug: 'choosing-an-english-language-test',
    title: 'Choosing between the English language tests',
    excerpt:
      'IELTS, TOEFL, PTE and Duolingo are not interchangeable. The right one is decided by your university and your visa route, in that order.',
    countryCode: null,
    tags: ['applications', 'english-tests'],
    readMinutes: 5,
    publishedAt: '2026-04-21',
    body: `The question is almost never "which test is easiest". It is "which test does my university accept, and does my visa route accept the same one". Get those two answers first; everything else is preference.

## Ask the university before you book

Acceptance varies by institution and sometimes by department within an institution. Minimum scores vary too, and many courses set a minimum for each component as well as an overall score — an overall 6.5 with a 5.5 in writing fails a requirement of 6.5 with no band below 6.0.

Some universities waive the test entirely if your previous degree was taught in English, or if you are from a country they consider majority English-speaking. That waiver is worth asking about before spending anything: it is the cheapest possible outcome and thousands of applicants never ask.

## Then check the visa route separately

This is the trap. A university may accept a test that the destination's immigration authority does not accept for a visa. The UK, for instance, requires a Secure English Language Test from an approved provider *at an approved centre* for applicants who need to prove English for the visa — and the approved list is shorter than the list of tests universities accept.

Confirm both before booking. A test that satisfies admissions and not immigration has to be taken again.

## What actually differs

**IELTS** — widely accepted, available on paper and computer. Academic is the version universities want; General Training is for migration and does not substitute.

**TOEFL iBT** — computer-based, entirely multiple-choice and typed alongside spoken responses recorded into a microphone. Strongly established with US institutions.

**PTE Academic** — computer-based and computer-scored, which is why results come back fastest. Useful when a deadline is close.

**Duolingo English Test** — cheapest, shortest, taken at home. Acceptance has widened considerably but is still narrower than the others, and it is accepted for fewer visa routes. Verify twice before relying on it.

The speaking component is the real difference in experience: IELTS is a conversation with an examiner, the others are recorded into a machine. People who freeze in front of a person and people who find talking to a screen unnatural are genuinely different populations, and it is worth knowing which you are before test day.

## Practical points

Book earlier than feels necessary. Test centres in large cities fill weeks ahead in the application season, and results take days to weeks depending on the test.

Sit one full timed practice paper before booking. It costs an afternoon and tells you whether you are near the required score or a term away from it — which is the difference between booking now and booking after a course of study.

Check score validity. Most are valid for two years from the test date, and the date that matters is the one when your university or the immigration authority assesses it, not when you applied.`,
  },
];
