const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = "my_verify_token";

const userState = {};

// ======================================================
// BASIC HELPERS
// ======================================================

function getState(user) {
    if (!userState[user]) {
        userState[user] = {
            step: "new_user",
            name: "",
            notificationEnabled: false,
            emotionContext: "",
            gratitudeIndex: 0,
            gratitudeAnswers: [],
            jokeIndex: 0,
            smartGoal: {},

            // TEST MYSELF
            assessmentType: "",
            assessmentIndex: 0,
            assessmentScore: 0,
            assessmentAnswers: []
        };
    }

    return userState[user];
}

function resetUser(user) {
    userState[user] = {
        step: "new_user",
        name: "",
        notificationEnabled: false,
        emotionContext: "",
        gratitudeIndex: 0,
        gratitudeAnswers: [],
        jokeIndex: 0,
        smartGoal: {},

        // TEST MYSELF
        assessmentType: "",
        assessmentIndex: 0,
        assessmentScore: 0,
        assessmentAnswers: []
    };

    return userState[user];
}


function normalise(value) {
    return String(value || "").trim().toLowerCase();
}

function containsAny(text, words) {
    const msg = normalise(text);
    return words.some(word => msg.includes(word));
}

// ======================================================
// WHATSAPP SEND FUNCTIONS
// ======================================================

async function sendWhatsApp(payload) {
    await axios.post(
        `https://graph.facebook.com/v23.0/${process.env.PHONE_NUMBER_ID}/messages`,
        payload,
        {
            headers: {
                Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                "Content-Type": "application/json"
            }
        }
    );
}

async function sendTextMessage(to, body) {
    await sendWhatsApp({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: {
            preview_url: false,
            body: String(body)
        }
    });
}

async function sendButtons(to, body, buttons) {
    await sendWhatsApp({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "interactive",
        interactive: {
            type: "button",
            body: {
                text: String(body)
            },
            action: {
                buttons: buttons.map(button => ({
                    type: "reply",
                    reply: {
                        id: button.id,
                        title: button.title
                    }
                }))
            }
        }
    });
}

async function sendList(to, body, buttonText, rows, sectionTitle = "Options") {
    await sendWhatsApp({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "interactive",
        interactive: {
            type: "list",
            body: {
                text: String(body)
            },
            action: {
                button: buttonText,
                sections: [
                    {
                        title: sectionTitle,
                        rows
                    }
                ]
            }
        }
    });
}

// ======================================================
// INTRODUCTION
// ======================================================

async function sendIntroduction(to) {
    await sendTextMessage(
        to,
        `Hello, I'm AIDA-MH, your wellbeing chatbot who will support you with emotional aspects of your diabetes journey.

Our conversations will be private and anonymous, so feel free to choose any nickname you like and we're good to go.

So... what would you like me to call you?`
    );
}

async function sendNotificationButtons(to, name) {
    await sendButtons(
        to,
        `Thank you ${name}! Before we start, please enable notifications for regular reminders, reports and messages.`,
        [
            {
                id: "enable_notifications",
                title: "Enable notifications"
            },
            {
                id: "not_now",
                title: "Not now"
            }
        ]
    );
}

async function sendSafetyButtons(to) {
    await sendButtons(
        to,
        `I will help you provide support and information for your diabetes, but I am not a substitute for professional medical advice.

If you're in immediate distress or feel unsafe, please contact emergency services or a mental health helpline.`,
        [
            {
                id: "emergency_services",
                title: "Emergency services"
            },
            {
                id: "continue_support",
                title: "Continue"
            }
        ]
    );
}

// ======================================================
// MAIN MENU
// ======================================================

async function sendMainMenu(to) {
    await sendList(
        to,
        `How can I support you today?`,
        "Choose support",
        [
            {
                id: "test_myself",
                title: "Test myself!"
            },
            {
                id: "emotions",
                title: "Emotions"
            },
            {
                id: "relationships",
                title: "Relationships"
            },
            {
                id: "healthcare_services",
                title: "Healthcare services"
            },
            {
                id: "diabetes_management",
                title: "Diabetes management"
            }
        ],
        "Support areas"
    );
}


// ======================================================
// TEST MYSELF - ANXIETY & DEPRESSION
// ======================================================

const anxietyQuestions = [
    "Feeling nervous, anxious or on edge",
    "Not being able to stop or control worrying",
    "Worrying too much about different things",
    "Trouble relaxing",
    "Being so restless that it is hard to sit still",
    "Becoming easily annoyed or irritable",
    "Feeling afraid as if something awful might happen"
];

const depressionQuestions = [
    "Little interest or pleasure in doing things",
    "Feeling down, depressed, or hopeless",
    "Trouble falling or staying asleep, or sleeping too much",
    "Feeling tired or having little energy",
    "Poor appetite or overeating",
    "Feeling bad about yourself — or that you are a failure or have let yourself or your family down",
    "Trouble concentrating on things, such as reading the newspaper or watching television",
    "Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual",
    "Thoughts that you would be better off dead or of hurting yourself in some way"
];

const assessmentResponses = [
    {
        id: "score_0",
        title: "Not at all",
        score: 0
    },
    {
        id: "score_1",
        title: "Several days",
        score: 1
    },
    {
        id: "score_2",
        title: "More than half the days",
        score: 2
    },
    {
        id: "score_3",
        title: "Nearly every day",
        score: 3
    }
];

async function sendTestMyselfMenu(to) {
    await sendList(
        to,
        `Let's check in with how you've been feeling.

Which self-check would you like to complete?`,
        "Choose test",
        [
            {
                id: "test_anxiety",
                title: "Anxiety"
            },
            {
                id: "test_depression",
                title: "Depression"
            }
        ],
        "Self-checks"
    );
}

async function startAnxietyAssessment(to, state) {
    state.assessmentType = "anxiety";
    state.assessmentIndex = 0;
    state.assessmentScore = 0;
    state.assessmentAnswers = [];
    state.step = "assessment_question";

    await sendTextMessage(
        to,
        `Anxiety self-check

Over the last 2 weeks, how often have you been bothered by the following?

There are no right or wrong answers.

Please choose the answer that best describes your experience.`
    );

    await sendAssessmentQuestion(to, state);
}

async function startDepressionAssessment(to, state) {
    state.assessmentType = "depression";
    state.assessmentIndex = 0;
    state.assessmentScore = 0;
    state.assessmentAnswers = [];
    state.step = "assessment_question";

    await sendTextMessage(
        to,
        `Depression self-check

Over the last 2 weeks, how often have you been bothered by the following?

There are no right or wrong answers.

Please choose the answer that best describes your experience.`
    );

    await sendAssessmentQuestion(to, state);
}

async function sendAssessmentQuestion(to, state) {
    const questions =
        state.assessmentType === "anxiety"
            ? anxietyQuestions
            : depressionQuestions;

    const questionNumber = state.assessmentIndex + 1;

    await sendList(
        to,
        `Question ${questionNumber} of ${questions.length}

${questions[state.assessmentIndex]}

Over the last 2 weeks, how often have you been bothered by this?`,
        "Choose answer",
        assessmentResponses.map(response => ({
            id: response.id,
            title: response.title
        })),
        "Your answer"
    );
}



async function finishAssessment(to, state) {
    const type =
        state.assessmentType === "anxiety"
            ? "Anxiety"
            : "Depression";

    const totalQuestions =
        state.assessmentType === "anxiety"
            ? anxietyQuestions.length
            : depressionQuestions.length;

    state.step = "assessment_complete";

    await sendTextMessage(
        to,
        `${type} self-check complete.

You answered all ${totalQuestions} questions.

Your total score is: ${state.assessmentScore}

This self-check is not a diagnosis. If you are concerned about how you are feeling, consider speaking with a healthcare professional.`
    );

    await sendButtons(
        to,
        `What would you like to do next?`,
        [
            {
                id: "test_again",
                title: "Test again"
            },
            {
                id: "main_menu",
                title: "Main menu"
            }
        ]
    );
}



async function handleAssessmentAnswer(to, selectedId, text, state) {
    const response = assessmentResponses.find(
        response => response.id === selectedId
    );

    if (!response) {
        await sendAssessmentQuestion(to, state);
        return;
    }

    // --------------------------------------------------
    // SAFETY-CRITICAL DEPRESSION QUESTION
    // --------------------------------------------------




    if (
        state.assessmentType === "depression" &&
        state.assessmentIndex === 8 &&
        response.score > 0
    ) {
        state.assessmentAnswers.push(response.score);
        state.assessmentScore += response.score;

        await sendCrisisMessage(to, state);
        return;
    }



    // --------------------------------------------------
    // SAVE ANSWER
    // --------------------------------------------------

    state.assessmentAnswers.push(response.score);
    state.assessmentScore += response.score;

    state.assessmentIndex += 1;

    const questions =
        state.assessmentType === "anxiety"
            ? anxietyQuestions
            : depressionQuestions;

    // --------------------------------------------------
    // MORE QUESTIONS
    // --------------------------------------------------

    if (state.assessmentIndex < questions.length) {
        await sendAssessmentQuestion(to, state);
        return;
    }

    // --------------------------------------------------
    // ASSESSMENT COMPLETE
    // --------------------------------------------------

    await finishAssessment(to, state);
}



// ======================================================
// EMOTIONS
// ======================================================

async function sendTryExercisesButtons(to) {
    await sendButtons(
        to,
        `I know some exercises that may help you with your anxiety.

Do you want to give them a try?`,
        [
            {
                id: "lets_do_it",
                title: "Let's do it!"
            },
            {
                id: "some_other_time",
                title: "Some other time"
            }
        ]
    );
}

async function sendActivitiesMenu(to) {
    await sendList(
        to,
        `Great! Make a choice!

Let's choose an activity that feels right for you.`,
        "Choose activity",
        [
            {
                id: "deep_breathing",
                title: "Deep breathing",
                description: "Try a calming breathing exercise"
            },
            {
                id: "mindfulness",
                title: "Mindfulness",
                description: "Bring attention to the present"
            },
            {
                id: "humour",
                title: "Humour",
                description: "Enjoy a light diabetes-friendly joke"
            },
            {
                id: "gratitude_journal",
                title: "Gratitude Journal",
                description: "Reflect on your treasures"
            },
            {
                id: "physical_activity",
                title: "Physical Activity",
                description: "Explore gentle movement"
            },
            {
                id: "smart_goals",
                title: "Setting SMART goals",
                description: "Create a small achievable goal"
            }
        ],
        "Emotional wellbeing activities"
    );
}

// ======================================================
// DEEP BREATHING
// ======================================================

async function sendBreathingMenu(to) {
    await sendButtons(
        to,
        `Great choice! Let's practice deep breathing together.

Choose a breathing exercise:`,
        [
            {
                id: "box_breathing",
                title: "Box breathing"
            },
            {
                id: "478_breathing",
                title: "4-7-8 Breathing"
            }
        ]
    );
}

async function sendBoxBreathing(to) {
    await sendTextMessage(
        to,
        `Box Breathing

Let's practise slowly together.

1. Breathe in gently through your nose for 4 seconds.

2. Hold your breath for 4 seconds.

3. Breathe out slowly for 4 seconds.

4. Hold for 4 seconds.

Repeat this cycle a few times at a comfortable pace.

There is no need to force your breathing.`
    );

    await sendBreathingFeelingButtons(to);
}

async function send478Breathing(to) {
    await sendTextMessage(
        to,
        `4-7-8 Breathing

Let's practise slowly together.

1. Breathe in gently through your nose for 4 seconds.

2. Hold your breath for 7 seconds.

3. Slowly breathe out through your mouth for 8 seconds.

Repeat gently at a pace that feels comfortable for you.

If holding your breath feels uncomfortable, stop and return to normal breathing.`
    );

    await sendBreathingFeelingButtons(to);
}

async function sendBreathingFeelingButtons(to) {
    await sendButtons(
        to,
        `Feeling better?`,
        [
            {
                id: "feeling_better",
                title: "I'm feeling better"
            },
            {
                id: "another_exercise",
                title: "Another exercise"
            }
        ]
    );
}

// ======================================================
// MINDFULNESS
// ======================================================

async function sendMindfulnessMenu(to) {
    await sendList(
        to,
        `Perfect! Here you go...

Choose a mindfulness exercise:`,
        "Choose exercise",
        [
            {
                id: "body_scan",
                title: "Body Scan Exercise"
            },
            {
                id: "five_senses",
                title: "Five Senses Exercise"
            },
            {
                id: "mindful_seeing",
                title: "Mindful Seeing"
            }
        ],
        "Mindfulness exercises"
    );
}

async function sendBodyScan(to) {
    await sendTextMessage(
        to,
        `Body Scan Exercise

Find a comfortable position and allow yourself a quiet moment.

Bring your attention gently to your body.

Start with your feet. Notice any sensations without trying to change them.

Slowly move your attention through your legs, stomach, chest, arms, hands, shoulders and face.

Notice areas of tension, warmth, heaviness or comfort.

Be aware of each sensation without judging it.

If your mind wanders, gently bring your attention back to your body and your breathing.`
    );

    await sendActivityCompleteButtons(to);
}

async function sendFiveSenses(to) {
    await sendTextMessage(
        to,
        `Five Senses Exercise

Notice five things that you can see.

Look around you and bring your attention to five things that you can see. Pick something that you don't normally notice, like a shadow or a small crack.

Notice four things that you can feel.

Bring awareness to four things that you are currently feeling, such as the texture of your clothes, the breeze on your skin or the surface beneath your hands.

Notice three things you can hear.

Listen and notice three things in the background, such as a bird, a humming appliance or traffic.

Notice two things you can smell.

Bring your awareness to smells that you usually filter out.

Notice one thing you can taste.

Focus on one thing you can taste right now.`
    );

    await sendActivityCompleteButtons(to);
}

async function sendMindfulSeeing(to) {
    await sendTextMessage(
        to,
        `Mindful Seeing

Step 1: Find a space at a window where there are sights to be seen outside.

Step 2: Look at everything there is to see. Avoid labelling or categorising what you see. Instead, notice colours, patterns and textures.

Step 3: Pay attention to movement, such as grass or leaves in the breeze. Notice the different shapes in the small part of the world you can see.

Step 4: Be observant, but not critical. Be aware but not fixated.

Step 5: If you become distracted, gently bring your attention back and notice a colour or shape again.`
    );

    await sendActivityCompleteButtons(to);
}

async function sendActivityCompleteButtons(to) {
    await sendButtons(
        to,
        `How are you feeling after the exercise?`,
        [
            {
                id: "activity_better",
                title: "I'm feeling better"
            },
            {
                id: "choose_another",
                title: "Another activity"
            }
        ]
    );
}

// ======================================================
// HUMOUR
// ======================================================

const jokes = [
    `Why do Brits with diabetes make great detectives?

Because they're already trained to investigate every label in Tesco 😄`,

    `Why do people with diabetes avoid Greggs on an empty stomach?

One whiff of a sausage roll and suddenly it's a maths exam 😄`,

    `My CGM alarm at 3am: BEEP BEEP BEEP!

Me: "Cheers mate, I didn't want sleep anyway. Overrated." 😄`,

    `Holiday mode:

My brain: "Relax! You're on the beach!"

My pancreas: "lol no" 😄`,

    `Why don't diabetics get stressed on UK holidays?

They're already used to constant monitoring... so checking the weather every 10 minutes feels normal 😄`
];

async function sendJoke(to, state) {
    const joke = jokes[state.jokeIndex % jokes.length];

    state.jokeIndex += 1;
    state.step = "humour_feedback";

    await sendTextMessage(
        to,
        `Let me tell you a joke then!

${joke}`
    );

    await sendButtons(
        to,
        `Feeling better?`,
        [
            {
                id: "joke_better",
                title: "I'm feeling better"
            },
            {
                id: "another_joke",
                title: "Tell me another joke"
            }
        ]
    );
}

// ======================================================
// GRATITUDE JOURNAL
// ======================================================

const gratitudePrompts = [
    "Today I smiled when...",
    "My favourite memory is...",
    "A good thing that happened to me today...",
    "I am happy when...",
    "The last gift I received was...",
    "Tell me a nice thing somebody said to you.",
    "A family tradition that I enjoy is...",
    "My biggest accomplishment is...",
    "My favourite food is...",
    "Someone who makes me happy is...",
    "List 3 activities that bring you joy.",
    "List 3 items that bring you joy.",
    "List 3 people that bring you joy."
];

async function startGratitudeJournal(to, state) {
    state.gratitudeIndex = 0;
    state.gratitudeAnswers = [];
    state.step = "gratitude_answer";

    await sendTextMessage(
        to,
        `Thornton Wilder once said, "We can only be said to be alive in those moments, when our hearts are conscious of our treasures."

Let's be mindful of your treasures and complete these sentences...

${gratitudePrompts[0]}`
    );
}

async function handleGratitudeAnswer(to, text, state) {
    state.gratitudeAnswers.push(text);
    state.gratitudeIndex += 1;

    if (state.gratitudeIndex < gratitudePrompts.length) {
        await sendTextMessage(
            to,
            `Thank you for sharing that 💙

${gratitudePrompts[state.gratitudeIndex]}`
        );

        return;
    }

    state.step = "gratitude_letter_choice";

    await sendButtons(
        to,
        `You've taken time to notice some meaningful things in your life.

Let's write down a Thank You letter.

Choose one of the people who gave you something to be grateful for and write them a letter to thank them for what they did.

Be sure to include details about how they helped you and how it made you feel.`,
        [
            {
                id: "write_letter",
                title: "Write my letter"
            },
            {
                id: "finish_gratitude",
                title: "Finish for now"
            }
        ]
    );
}

// ======================================================
// PHYSICAL ACTIVITY
// ======================================================

async function sendPhysicalActivityMenu(to) {
    await sendList(
        to,
        `Let's move together!

Choose an activity option:`,
        "Choose movement",
        [
            {
                id: "sofa_activity",
                title: "Get Active from S.O.F.A.",
                description: "Explore the activity resource"
            },
            {
                id: "moving_more",
                title: "Your guide to moving more",
                description: "Diabetes UK movement guidance"
            },
            {
                id: "walk_notifications",
                title: "Set walk notifications",
                description: "Create a walking reminder"
            }
        ],
        "Physical activity"
    );
}

async function sendWalkReminderChoice(to) {
    await sendButtons(
        to,
        `Setting a walk notification can help you remember to make time for gentle movement.

Would you like to choose a time for your walk reminder?`,
        [
            {
                id: "set_walk_time",
                title: "Set walk time"
            },
            {
                id: "not_now_walk",
                title: "Not now"
            }
        ]
    );
}

// ======================================================
// SMART GOALS
// ======================================================

async function startSmartGoal(to, state) {
    state.smartGoal = {};
    state.step = "smart_specific";

    await sendTextMessage(
        to,
        `Let's be SMART together!

Answer a few questions to set your SMARTest goal...

What exactly do you want to achieve?

Make sure to be specific.

Example: I will lose 5 lbs.

Now tell me your specific goal.`
    );
}

async function handleSmartGoal(to, text, state) {
    if (state.step === "smart_specific") {
        state.smartGoal.specific = text;
        state.step = "smart_measurable";

        await sendTextMessage(
            to,
            `Great.

Next question is...

How will you tell when your goal has been accomplished?

Example of a measurable goal: My weight will reduce to 155 lbs.

How will you measure your success?`
        );

        return;
    }

    if (state.step === "smart_measurable") {
        state.smartGoal.measurable = text;
        state.step = "smart_achievable";

        await sendTextMessage(
            to,
            `Thank you.

Next question is...

What actions will you take to achieve this goal?

Example: Every day I will eat a planned diet and walk for 30 minutes.

What actions will you take?`
        );

        return;
    }

    if (state.step === "smart_achievable") {
        state.smartGoal.achievable = text;
        state.step = "smart_relevant";

        await sendTextMessage(
            to,
            `You're doing well.

Next question is...

How is this goal relevant to you?

Example: It will help me keep my blood sugar levels under control.

Why is this goal important to you?`
        );

        return;
    }

    if (state.step === "smart_relevant") {
        state.smartGoal.relevant = text;
        state.step = "smart_timebound";

        await sendTextMessage(
            to,
            `I promise this is the last one...

Set the start and end date for this goal.

Example: 01-02-2026 to 28-02-2026.

What is your start and end date?`
        );

        return;
    }

    if (state.step === "smart_timebound") {
        state.smartGoal.timebound = text;
        state.step = "smart_complete";

        await sendTextMessage(
            to,
            `You did it! 💙

Here is your SMART goal:

SPECIFIC:
${state.smartGoal.specific}

MEASURABLE:
${state.smartGoal.measurable}

ACHIEVABLE ACTIONS:
${state.smartGoal.achievable}

RELEVANT TO YOU:
${state.smartGoal.relevant}

TIME-BOUND:
${state.smartGoal.timebound}

You've broken your goal into clear and manageable steps.`
        );

        await sendButtons(
            to,
            `What would you like to do next?`,
            [
                {
                    id: "another_activity",
                    title: "Another activity"
                },
                {
                    id: "main_menu",
                    title: "Main menu"
                }
            ]
        );
    }
}

// ======================================================
// CLOSING
// ======================================================

async function sendEmotionalClosing(to) {
    await sendTextMessage(
        to,
        `Thank you for sharing with me today.

You're managing a lot, and taking time to reflect like this is meaningful.

I'm here whenever you need support.`
    );
}

// ======================================================
// CRISIS DETECTION
// ======================================================

function isCrisisMessage(text) {
    return containsAny(text, [
        "want to die",
        "kill myself",
        "hurt myself",
        "suicide",
        "can't go on",
        "cannot go on",
        "wish i could disappear",
        "don't want to live",
        "do not want to live"
    ]);
}


async function sendCrisisMessage(to, state) {
    state.step = "crisis_choice";

    await sendTextMessage(
        to,
        `I'm really concerned about what you've shared.

You're not alone, and support is available.

It's important to speak to someone immediately.

If you are in immediate danger, call 999 now.

For urgent mental health help, call NHS 111 and select the mental health option, or ask for an urgent GP appointment.

You can also call Samaritans on 116 123.

If possible, tell someone you trust and don't stay alone.`
    );

    await sendButtons(
        to,
        `What would you like to do next?`,
        [
            {
                id: "emergency_services",
                title: "Emergency services"
            },
            {
                id: "main_menu",
                title: "Main menu"
            }
        ]
    );
}

// ======================================================
// WEBHOOK GET - META VERIFICATION
// ======================================================

app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("Webhook verified.");
        return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
});

// ======================================================
// WEBHOOK POST
// ======================================================

app.post("/webhook", async (req, res) => {
    console.log("===== WEBHOOK HIT =====");
    console.log(JSON.stringify(req.body, null, 2));

    // Respond to Meta immediately.
    res.sendStatus(200);

    try {
        const value =
            req.body.entry?.[0]?.changes?.[0]?.value;

        const message =
            value?.messages?.[0];

        if (!message) {
            return;
        }

        const from = message.from;

        let text = "";
        let selectedId = "";

        if (message.type === "text") {
            text = message.text?.body || "";
        }

        if (message.type === "interactive") {
            if (message.interactive?.type === "button_reply") {
                selectedId =
                    message.interactive.button_reply?.id || "";

                text =
                    message.interactive.button_reply?.title || "";
            }

            if (message.interactive?.type === "list_reply") {
                selectedId =
                    message.interactive.list_reply?.id || "";

                text =
                    message.interactive.list_reply?.title || "";
            }
        }

        console.log("FROM =", from);
        console.log("TEXT =", text);
        console.log("SELECTED ID =", selectedId);

        let state = getState(from);

        // ==================================================
        // CRISIS CHECK - ALWAYS FIRST
        // ==================================================

        if (isCrisisMessage(text)) {
            await sendCrisisMessage(from, state);
            return;
        }
        // ==================================================
        // RESTART COMMAND
        // ==================================================

        if (normalise(text) === "restart") {
            state = resetUser(from);
            state.step = "awaiting_name";

            await sendIntroduction(from);
            return;
        }

        // ==================================================
        // NEW USER
        // ==================================================

        if (state.step === "new_user") {
            state.step = "awaiting_name";

            await sendIntroduction(from);
            return;
        }

        // ==================================================
        // NAME
        // ==================================================

        if (state.step === "awaiting_name") {
            state.name = text;
            state.step = "notification_choice";

            await sendNotificationButtons(
                from,
                state.name
            );

            return;
        }

        // ==================================================
        // NOTIFICATIONS
        // ==================================================

        if (state.step === "notification_choice") {
            if (selectedId === "enable_notifications") {
                state.notificationEnabled = true;
            }

            if (selectedId === "not_now") {
                state.notificationEnabled = false;
            }

            if (
                selectedId !== "enable_notifications" &&
                selectedId !== "not_now"
            ) {
                await sendNotificationButtons(
                    from,
                    state.name
                );

                return;
            }

            state.step = "safety_choice";

            await sendSafetyButtons(from);
            return;
        }

        // ==================================================
        // SAFETY
        // ==================================================

        if (state.step === "safety_choice") {
            if (selectedId === "emergency_services") {
                await sendTextMessage(
                    from,
                    `If you need urgent help for your mental health, call 111 and select the mental health option or ask for an urgent GP appointment.`
                );

                await sendSafetyButtons(from);
                return;
            }

            if (selectedId === "continue_support") {
                state.step = "main_menu";

                await sendMainMenu(from);
                return;
            }

            await sendSafetyButtons(from);
            return;
        }

        // ==================================================
        // MAIN MENU
        // ==================================================

        if (state.step === "main_menu") {
            if (selectedId === "emotions") {
                state.step = "emotion_share";

                await sendTextMessage(
                    from,
                    `Would you like to share more about how you're feeling right now?`
                );

                return;
            }

            if (selectedId === "test_myself") {
                state.step = "test_myself_menu";

                await sendTestMyselfMenu(from);
                return;
            }

            if (selectedId === "relationships") {
                await sendTextMessage(
                    from,
                    `The Relationships framework will be connected after the Emotions section.`
                );

                await sendMainMenu(from);
                return;
            }

            if (selectedId === "healthcare_services") {
                await sendTextMessage(
                    from,
                    `The Healthcare Services framework will be connected after the Emotions section.`
                );

                await sendMainMenu(from);
                return;
            }

            if (selectedId === "diabetes_management") {
                await sendList(
                    from,
                    `Diabetes Management`,
                    "Choose option",
                    [
                        {
                            id: "smart_goals",
                            title: "Setting SMART goals"
                        },
                        {
                            id: "reflect",
                            title: "Reflect"
                        }
                    ],
                    "Diabetes management"
                );

                state.step = "diabetes_management_menu";
                return;
            }

            await sendMainMenu(from);
            return;
        }




        // ======================================================
        // TEST MYSELF MENU
        // ======================================================

        if (state.step === "test_myself_menu") {

            if (selectedId === "test_anxiety") {
                await startAnxietyAssessment(from, state);
                return;
            }

            if (selectedId === "test_depression") {
                await startDepressionAssessment(from, state);
                return;
            }

            await sendTestMyselfMenu(from);
            return;
        }




        // ======================================================
        // TEST MYSELF - QUESTION HANDLER
        // ======================================================

        if (state.step === "assessment_question") {

            await handleAssessmentAnswer(
                from,
                selectedId,
                text,
                state
            );

            return;
        }




        // ======================================================
        // TEST MYSELF - COMPLETED
        // ======================================================

        if (state.step === "assessment_complete") {

            if (selectedId === "test_again") {
                await sendTestMyselfMenu(from);
                state.step = "test_myself_menu";
                return;
            }

            if (selectedId === "main_menu") {
                state.step = "main_menu";
                await sendMainMenu(from);
                return;
            }

            await sendButtons(
                from,
                `Please choose what you would like to do next.`,
                [
                    {
                        id: "test_again",
                        title: "Test again"
                    },
                    {
                        id: "main_menu",
                        title: "Main menu"
                    }
                ]
            );

            return;
        }






        // ==================================================
        // EMOTION SHARING
        // ==================================================

        if (state.step === "emotion_share") {
            state.emotionContext = text;

            if (
                containsAny(text, [
                    "anxious",
                    "anxiety",
                    "worry",
                    "worried",
                    "fear",
                    "panic",
                    "blood sugar",
                    "blood sugars",
                    "glucose"
                ])
            ) {
                state.step = "exercise_choice";

                await sendTextMessage(
                    from,
                    `${state.name}, that sounds really stressful.

Constant worry can take a toll, especially when managing a long-term condition.

Anxiety can also affect your physical health, including blood glucose levels.`
                );

                await sendTryExercisesButtons(from);
                return;
            }

            if (
                containsAny(text, [
                    "tired of diabetes",
                    "exhausted",
                    "burnout",
                    "burned out",
                    "full-time job",
                    "full time job",
                    "want a break",
                    "failing"
                ])
            ) {
                state.step = "burnout_action";

                await sendList(
                    from,
                    `That sounds exhausting.

Managing diabetes every day can feel like a constant responsibility.

Many people experience burnout at times.

Let's focus on something small and manageable today.

What's one thing you feel you can do right now?`,
                    "Choose one",
                    [
                        {
                            id: "short_walk",
                            title: "Short walk"
                        },
                        {
                            id: "drink_water",
                            title: "Drink water"
                        },
                        {
                            id: "check_glucose",
                            title: "Check glucose once"
                        },
                        {
                            id: "take_break",
                            title: "Take a break"
                        }
                    ],
                    "Small steps"
                );

                return;
            }

            state.step = "emotion_clarify";

            await sendTextMessage(
                from,
                `Thank you for sharing that with me.

It sounds like you're carrying a lot right now.

Would you like to tell me a little more about what happened today or what is making you feel this way?`
            );

            return;
        }

        // ==================================================
        // EMOTION CLARIFICATION
        // ==================================================

        if (state.step === "emotion_clarify") {
            state.emotionContext += ` ${text}`;
            state.step = "exercise_choice";

            await sendTextMessage(
                from,
                `Thank you for explaining that, ${state.name}.

That sounds really stressful.

I know some short activities that may help you take a moment for yourself.`
            );

            await sendTryExercisesButtons(from);
            return;
        }

        // ==================================================
        // BURNOUT ACTION
        // ==================================================

        if (state.step === "burnout_action") {
            if (
                [
                    "short_walk",
                    "drink_water",
                    "check_glucose",
                    "take_break"
                ].includes(selectedId)
            ) {
                state.step = "activities_menu";

                await sendTextMessage(
                    from,
                    `That's a small and manageable step.

You don't have to solve everything at once.`
                );

                await sendActivitiesMenu(from);
                return;
            }

            return;
        }

        // ==================================================
        // EXERCISE CHOICE
        // ==================================================

        if (state.step === "exercise_choice") {
            if (selectedId === "some_other_time") {
                state.step = "main_menu";

                await sendTextMessage(
                    from,
                    `That's completely okay.

I'm here whenever you need support.`
                );

                await sendMainMenu(from);
                return;
            }

            if (selectedId === "lets_do_it") {
                state.step = "activities_menu";

                await sendActivitiesMenu(from);
                return;
            }

            await sendTryExercisesButtons(from);
            return;
        }

        // ==================================================
        // ACTIVITIES MENU
        // ==================================================

        if (state.step === "activities_menu") {
            if (selectedId === "deep_breathing") {
                state.step = "breathing_menu";

                await sendBreathingMenu(from);
                return;
            }

            if (selectedId === "mindfulness") {
                state.step = "mindfulness_menu";

                await sendMindfulnessMenu(from);
                return;
            }

            if (selectedId === "humour") {
                await sendJoke(from, state);
                return;
            }

            if (selectedId === "gratitude_journal") {
                await startGratitudeJournal(
                    from,
                    state
                );

                return;
            }

            if (selectedId === "physical_activity") {
                state.step = "physical_activity_menu";

                await sendPhysicalActivityMenu(from);
                return;
            }

            if (selectedId === "smart_goals") {
                await startSmartGoal(from, state);
                return;
            }

            await sendActivitiesMenu(from);
            return;
        }

        // ==================================================
        // BREATHING MENU
        // ==================================================

        if (state.step === "breathing_menu") {
            if (selectedId === "box_breathing") {
                state.step = "breathing_feedback";

                await sendBoxBreathing(from);
                return;
            }

            if (selectedId === "478_breathing") {
                state.step = "breathing_feedback";

                await send478Breathing(from);
                return;
            }

            await sendBreathingMenu(from);
            return;
        }

        // ==================================================
        // BREATHING FEEDBACK
        // ==================================================

        if (state.step === "breathing_feedback") {
            if (selectedId === "feeling_better") {
                state.step = "main_menu";

                await sendTextMessage(
                    from,
                    `I'm glad to hear that, ${state.name}. You did a great job taking that step.

Sometimes even a few minutes of breathing can help calm both the mind and body.`
                );

                await sendEmotionalClosing(from);
                await sendMainMenu(from);
                return;
            }

            if (selectedId === "another_exercise") {
                state.step = "breathing_menu";

                await sendTextMessage(
                    from,
                    `Perfect! Here you go...

You can come back to these breathing techniques whenever you feel overwhelmed.

It might help you to use them:

• Before checking glucose
• When feeling stressed
• Before sleeping`
                );

                await sendBreathingMenu(from);
                return;
            }

            await sendBreathingFeelingButtons(from);
            return;
        }

        // ==================================================
        // MINDFULNESS MENU
        // ==================================================

        if (state.step === "mindfulness_menu") {
            if (selectedId === "body_scan") {
                state.step = "activity_feedback";

                await sendBodyScan(from);
                return;
            }

            if (selectedId === "five_senses") {
                state.step = "activity_feedback";

                await sendFiveSenses(from);
                return;
            }

            if (selectedId === "mindful_seeing") {
                state.step = "activity_feedback";

                await sendMindfulSeeing(from);
                return;
            }

            await sendMindfulnessMenu(from);
            return;
        }

        // ==================================================
        // GENERAL ACTIVITY FEEDBACK
        // ==================================================

        if (state.step === "activity_feedback") {
            if (selectedId === "activity_better") {
                state.step = "main_menu";

                await sendEmotionalClosing(from);
                await sendMainMenu(from);
                return;
            }

            if (selectedId === "choose_another") {
                state.step = "activities_menu";

                await sendActivitiesMenu(from);
                return;
            }

            await sendActivityCompleteButtons(from);
            return;
        }

        // ==================================================
        // HUMOUR FEEDBACK
        // ==================================================

        if (state.step === "humour_feedback") {
            if (selectedId === "another_joke") {
                await sendJoke(from, state);
                return;
            }

            if (selectedId === "joke_better") {
                state.step = "main_menu";

                await sendEmotionalClosing(from);
                await sendMainMenu(from);
                return;
            }

            return;
        }

        // ==================================================
        // GRATITUDE ANSWERS
        // ==================================================

        if (state.step === "gratitude_answer") {
            await handleGratitudeAnswer(
                from,
                text,
                state
            );

            return;
        }

        // ==================================================
        // GRATITUDE LETTER CHOICE
        // ==================================================

        if (state.step === "gratitude_letter_choice") {
            if (selectedId === "write_letter") {
                state.step = "gratitude_letter";

                await sendTextMessage(
                    from,
                    `Write your Thank You letter here.

Include:

• Who you're thanking
• What they did
• How they helped you
• How it made you feel

Take your time.`
                );

                return;
            }

            if (selectedId === "finish_gratitude") {
                state.step = "main_menu";

                await sendEmotionalClosing(from);
                await sendMainMenu(from);
                return;
            }

            return;
        }

        // ==================================================
        // GRATITUDE LETTER
        // ==================================================

        if (state.step === "gratitude_letter") {
            state.step = "main_menu";

            await sendTextMessage(
                from,
                `Thank you for writing that.

Taking time to recognise how someone helped you and how it made you feel can be meaningful.`
            );

            await sendEmotionalClosing(from);
            await sendMainMenu(from);
            return;
        }

        // ==================================================
        // PHYSICAL ACTIVITY
        // ==================================================

        if (state.step === "physical_activity_menu") {
            if (selectedId === "sofa_activity") {
                state.step = "activity_feedback";

                await sendTextMessage(
                    from,
                    `Let's move together!

Get Active from your S.O.F.A.

Choose a comfortable and safe space and take a moment to explore gentle movement that feels manageable for you today.

Start small and listen to your body.`
                );

                await sendActivityCompleteButtons(from);
                return;
            }

            if (selectedId === "moving_more") {
                state.step = "activity_feedback";

                await sendTextMessage(
                    from,
                    `Your guide to moving more

Moving more doesn't have to mean doing everything at once.

You can begin with small amounts of movement that feel manageable.

A short walk or adding gentle movement to your daily routine can be a starting point.

If you have concerns about exercising safely with diabetes, speak with your healthcare professional.`
                );

                await sendActivityCompleteButtons(from);
                return;
            }

            if (selectedId === "walk_notifications") {
                state.step = "walk_notification_choice";

                await sendWalkReminderChoice(from);
                return;
            }

            await sendPhysicalActivityMenu(from);
            return;
        }

        // ==================================================
        // WALK NOTIFICATION
        // ==================================================

        if (state.step === "walk_notification_choice") {
            if (selectedId === "set_walk_time") {
                state.step = "walk_time";

                await sendTextMessage(
                    from,
                    `What time would you like your walk reminder?

For example: 6:00 PM`
                );

                return;
            }

            if (selectedId === "not_now_walk") {
                state.step = "activities_menu";

                await sendActivitiesMenu(from);
                return;
            }

            return;
        }

        if (state.step === "walk_time") {
            state.walkTime = text;
            state.step = "activities_menu";

            await sendTextMessage(
                from,
                `Thank you.

Your preferred walk reminder time is ${text}.

We'll keep this as your walking reminder preference.`
            );

            await sendActivitiesMenu(from);
            return;
        }

        // ==================================================
        // SMART GOAL FLOW
        // ==================================================

        if (
            [
                "smart_specific",
                "smart_measurable",
                "smart_achievable",
                "smart_relevant",
                "smart_timebound"
            ].includes(state.step)
        ) {
            await handleSmartGoal(
                from,
                text,
                state
            );

            return;
        }

        if (state.step === "smart_complete") {
            if (selectedId === "another_activity") {
                state.step = "activities_menu";

                await sendActivitiesMenu(from);
                return;
            }

            if (selectedId === "main_menu") {
                state.step = "main_menu";

                await sendMainMenu(from);
                return;
            }

            return;
        }

        // ==================================================
        // DIABETES MANAGEMENT MENU
        // ==================================================

        if (state.step === "diabetes_management_menu") {
            if (selectedId === "smart_goals") {
                await startSmartGoal(from, state);
                return;
            }

            if (selectedId === "reflect") {
                state.step = "main_menu";

                await sendTextMessage(
                    from,
                    `Looking back, looking forward:

Reflect on your past successes and think about how you will achieve them in future.

Every day for three days, choose a positive experience from your life.

Imagine yourself in that moment and think about the feelings and emotions you experienced.

Write about the experience in as much detail as possible, paying attention to the positive feelings, thoughts and emotions that were present.

For example: Think about the last time you had your diabetes under control.`
                );

                await sendMainMenu(from);
                return;
            }

            return;
        }

        // ==================================================



        // ==================================================
        // CRISIS CHOICE
        // ==================================================

        if (state.step === "crisis_choice") {

            if (selectedId === "emergency_services") {
                await sendTextMessage(
                    from,
                    `If you are in immediate danger, please call 999 now.

For urgent mental health help, call NHS 111 and select the mental health option, or ask for an urgent GP appointment.

You can also call Samaritans on 116 123.`
                );

                await sendButtons(
                    from,
                    `What would you like to do next?`,
                    [
                        {
                            id: "main_menu",
                            title: "Main menu"
                        }
                    ]
                );

                return;
            }

            if (selectedId === "main_menu") {
                state.step = "main_menu";

                await sendMainMenu(from);
                return;
            }

            await sendButtons(
                from,
                `Please choose an option below.`,
                [
                    {
                        id: "emergency_services",
                        title: "Emergency services"
                    },
                    {
                        id: "main_menu",
                        title: "Main menu"
                    }
                ]
            );

            return;
        }

        // ==================================================
        // FALLBACK
        // ==================================================

        state.step = "main_menu";

        await sendMainMenu(from);

    } catch (error) {
        console.error(
            "WEBHOOK ERROR:",
            error.response?.status,
            JSON.stringify(
                error.response?.data || error.message,
                null,
                2
            )
        );
    }
});

// ======================================================
// START SERVER
// ======================================================

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(
        "PHONE_NUMBER_ID =",
        process.env.PHONE_NUMBER_ID
    );
    console.log(
        "WHATSAPP TOKEN EXISTS =",
        !!process.env.WHATSAPP_TOKEN
    );
});