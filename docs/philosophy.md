# The philosophy behind the 7 Laws

The whole product is built on one sentence. Everything else in this repository, the hooks, the skills, the instinct engine, is an attempt to make a coding agent behave the way that sentence describes.

## The sentence

> الْكَيِّسُ مَنْ دَانَ نَفْسَهُ وَعَمِلَ لِمَا بَعْدَ الْمَوْتِ، وَالْعَاجِزُ مَنْ أَتْبَعَ نَفْسَهُ هَوَاهَا وَتَمَنَّى عَلَى اللَّهِ

> Orang yang bijak ialah orang yang sentiasa memuhasabah (menilai) dirinya dan beramal sebagai persiapan untuk kehidupan selepas mati, manakala orang yang lemah ialah orang yang mengikut hawa nafsu dan hanya berangan-angan kepada Allah.

> The wise one is the one who takes account of himself and works for what comes after death. The weak one is the one who follows his own desires and then merely wishes upon Allah.

Narrated by Shaddad ibn Aws. Jami` at-Tirmidhi 2459 (Tirmidhi graded it hasan; al-Albani graded its chain weak) and Sunan Ibn Majah 4260 (one word differs: *thumma* for *wa*). Both gradings are printed here because a product built on verify-before-reporting does not get to hide one. Sources: [Tirmidhi 2459](https://sunnah.com/tirmidhi:2459), [Ibn Majah 4260](https://sunnah.com/ibnmajah:4260), gradings at [hadithunlocked](https://hadithunlocked.com/tirmidhi:2459) and [dorar.net](https://dorar.net/hadith/sharh/231290).

Tirmidhi's own gloss on "takes account of himself" (*dana nafsahu*) is that he audits himself in this world before he is audited on the Day of Judgement. In the same passage he quotes Umar ibn al-Khattab, "Hold yourselves to account before you are held to account," and Maymun ibn Mihran, who said a person is not careful until he audits himself the way he audits a business partner: where did it come from, where did it go. That is a ledger, not a feeling.

On the wording above: the Malay line is the rendering this project was briefed with; "sentiasa memuhasabah" and "persiapan untuk kehidupan" follow Tirmidhi's gloss rather than the bare text. Mufti Wilayah Persekutuan's published rendering is closer to the letter: "Orang yang cerdik, siapa yang merendahkan dirinya dan beramal untuk bekalan selepas mati. Sedangkan orang yang lemah, siapa yang mengikut hawa nafsunya dan hanya bercita-cita kepada Allah." ([Bayan Linnas 2966](https://muftiwp.gov.my/en/artikel/bayan-linnas/2966)). The first word, *al-kayyis*, is glossed by the commentators as the intelligent, resolute one who looks to consequences; "sharp" is a fair English gloss, which is why the headline "Claude Code that gets sharper every session" already sits beside it.

You do not need the theology to use the engineering. Read it as a secular engineer and it still holds: **audit yourself before someone else does, and hope is not a verification strategy.**

## Two kinds of agent

The sentence describes two agents. You have worked with both.

| | The wise agent | The weak agent |
|---|---|---|
| Before acting | Sets conditions: what exists, what could break, what "done" means | Follows the first impulse: "I'll just quickly..." |
| While acting | Watches itself: one change, one verification | Piles on: "While I'm here..." and "And also..." |
| After acting | Takes account: runs the check, reads the real output | Wishes: "This should work..." |
| Toward the future | Works for what comes after this session: a captured lesson, a clean base for the next person | Promises: "I'll remember..." and "Next time I'll..." |

Every red flag on the `/discipline` card is a symptom of the second column. Every Law is a mechanism that moves the agent to the first.

| Red flag | Which half of the sentence it violates | Law that catches it |
|---|---|---|
| "I'll just quickly..." | Following impulse instead of taking account first | 1. Research Before Executing |
| "Let me also add..." | Desire over the agreed conditions | 2. Plan Is Sacred |
| "While I'm here..." | Desire over the agreed conditions | 3. One Thing at a Time |
| "This should work..." | Wishing instead of checking | 4. Verify Before Reporting |
| "I'll remember..." | Wishing instead of working for what comes after | 5. Reflect After Sessions |
| "And also..." | Desire over the agreed conditions | 6. Iterate One Change |
| "Next time I'll..." | Wishing instead of working for what comes after | 7. Learn From Every Session |

## The loop is an old loop

The 7 Laws run as one pass: Research, Plan, Execute one thing, Verify, Reflect, Learn, Iterate. That shape is not new. In Book 38 of the *Ihya Ulum al-Din* (Kitab al-Muraqaba wa al-Muhasaba), al-Ghazali lays out six stations of self-discipline in four phases around every act. The mapping below is ours; al-Ghazali was writing about the soul, not software, and we borrow the structure, not the theology. Source for the six stations and their phases: Abdallah Rothman, [*Tools for Transformation*](https://www.cambridgemuslimcollege.ac.uk/wp-content/uploads/2023/04/Tools-for-Transformation.pdf), Cambridge Muslim College, based on Ihya Book 38.

| Phase | Station | Meaning | In this product |
|---|---|---|---|
| Before the act | Musharatah | Agree the conditions up front | Law 1 (search what exists) and Law 2 (state WILL, WILL NOT, VERIFY before touching code). `gateguard` blocks the first edit until those facts are on the table. |
| During the act | Muraqabah | Vigilance: watch yourself as you act, asking why, how, and for whom | Law 3 (one thing at a time) and the observation hooks. The engine is named **Mulahazah**, observation, for this phase. |
| After the act | Muhasabah | Self-accounting: examine what you actually did | Law 4 (read the real output, not the assumed one) and Law 5 (the reflection block: what worked, what failed, rule to add). |
| Responding to the act | Mu'aqabah | Penalty for the lapse | A correction from the user drops an instinct's confidence by 0.1. Behavior that was wrong gets weaker, mechanically. |
| | Mujahadah | Renewed striving | Law 6: one change, verify, next change. A failure loops back to research instead of carrying forward. |
| | Mu'atabah | Self-censure | Law 7: the "Rule to add" line becomes an instinct with 0.6 starting confidence, so the reproach outlives the session. |

Rothman summarises the vigilance phase as three accountings to ask in the middle of any act: *why* (obligation or desire?), *how* (verified knowledge or supposition?), and *for whom*. Replace "for whom" with "for which stated goal" and you have the goal-monitor.

## What this changes in the product

The philosophy is not a slogan on the landing page. It decides design questions:

- **The gate sits before the edit, not after.** A wishful edit is the first-column failure. So `hooks/gateguard.mjs` refuses the first mutation per file until the investigation is presented, instead of reviewing the damage later.
- **"Done" is an observed outcome.** Law 4 requires the actual command output. A reply that says "should work" is, in the sentence's terms, wishing upon the reviewer.
- **Nothing learned is permanent.** Instincts decay without reinforcement and weaken on correction. Self-accounting that happens once is not self-accounting.
- **Reflection is structured, not optional.** The Law 5 block has fixed fields because an unstructured "lessons learned" paragraph is how "I'll remember..." disguises itself.
- **The stance is model-forward.** As models improve, the reminders merge into the model. The self-accounting loop does not. The durable core is goal-driven execution plus guardrails, which is the sentence restated.

## The two names

- **Mulahazah** (ملاحظة): observation, noticing. The engine that records every tool call and turns repeated patterns into instincts. It is the product's name for the during-the-act phase, chosen for the plain meaning of the word. It is not a word in the hadith, and the classical term for that phase is *muraqabah* (vigilance); do not read the engine's name as scripture.
- **Muhasabah** (محاسبة): accounting, taking stock, from the root h-s-b, to count. The word Tirmidhi uses to explain "takes account of himself". The after-the-act phase. Law 4 and Law 5 are muhasabah applied to a coding session.

Observation feeds accounting. Accounting feeds the next session. That is the whole loop, and it is older than software.
