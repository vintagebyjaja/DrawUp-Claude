/* DrawUp v29 help registry + question matcher. GENERATED from src/lib/drawup-help.ts (esbuild --format=iife --global-name=DrawUpHelpCore). Edit the .ts file, then rebuild. */
"use strict";
var DrawUpHelpCore = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/lib/drawup-help.ts
  var drawup_help_exports = {};
  __export(drawup_help_exports, {
    FEATURES: () => FEATURES,
    REGISTRY_VERSION: () => REGISTRY_VERSION,
    answerFor: () => answerFor,
    answerHelp: () => answerHelp,
    contentTokens: () => contentTokens,
    featureById: () => featureById,
    helpText: () => helpText,
    normalize: () => normalize,
    platformBrief: () => platformBrief,
    stem: () => stem,
    withOverrides: () => withOverrides
  });
  var P = (tab, extra = {}) => ({ tab, ...extra });
  var REGISTRY_VERSION = "29.0";
  var FEATURES = [
    // ---- home
    {
      id: "dashboard",
      name: "Dashboard",
      desc: "Your home in the portal: recent projects, activity, quick actions and the Arch Coach ask bar.",
      path: ["Dashboard"],
      go: P("dashboard"),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["dashboard", "home", "home page", "portal home", "main page", "start page", "command center"]
    },
    {
      id: "search",
      name: "DrawUp Search",
      desc: "Search projects, buildings, firms, people and questions across DrawUp.",
      path: ["Discover", "Search DrawUp"],
      go: P("search"),
      publicGo: { page: "home", scroll: "#drawup-search-box" },
      access: "public",
      status: "live",
      season: 1,
      credits: "Free",
      aliases: ["search", "search drawup", "global search", "search bar", "who designed", "look up a building", "search firms and projects"]
    },
    // ---- projects
    {
      id: "projects",
      name: "Projects",
      desc: "All of your projects. Open one to see its drawing sets, checks, files and AI Team memory.",
      path: ["Projects", "All Projects"],
      go: P("projects"),
      access: "member",
      status: "live",
      season: 1,
      steps: ["Open Projects in the top menu.", "Pick a project card to open it."],
      aliases: ["projects", "my projects", "my project", "project list", "all projects", "find my project", "open my project", "open a project", "saved projects", "project files", "where my work"]
    },
    {
      id: "new-project",
      name: "Start a new project",
      desc: "Create a project with a name, location and cover. The AI Team and your sets then work in its context.",
      path: ["Projects", "Start a new project"],
      go: P("projects", { click: "#du-new-project" }),
      access: "member",
      status: "live",
      season: 1,
      steps: ["Open Projects.", "Choose New project, then give it a name and location."],
      aliases: ["new project", "create project", "create a project", "start project", "start a project", "add project", "make a project", "make new project"]
    },
    {
      id: "drawing-sets",
      name: "Drawing Sets",
      desc: "Drawing sets made with Draw it up, filed by sheet under each project.",
      path: ["Projects", "Drawing Sets"],
      go: P("projects", { scroll: "#du-dit24-recent" }),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["drawing set", "drawing sets", "my sets", "my drawing sets", "drawup sets", "sheet set", "my sheets", "construction set", "cd set"]
    },
    {
      id: "drawup-ready",
      name: "DrawUp Ready starter project",
      desc: "The 3-step starter learning project: Find the flaws, Understand the fix, DrawUp Ready.",
      path: ["Projects", "DrawUp Ready"],
      go: P("projects", { openStarter: true }),
      access: "member",
      status: "live",
      season: 1,
      brand: true,
      aliases: ["drawup ready", "starter project", "example project", "sample project", "learning project", "athletic storage"]
    },
    // ---- AI Team
    {
      id: "ai-team",
      name: "AI Team",
      desc: "Arch Coach, Teammate and 6th Man in one conversation. Pick a project in the Project filter to work in its context.",
      path: ["AI Team", "AI Workspace"],
      go: P("ai-team"),
      access: "member",
      status: "live",
      season: 1,
      brand: true,
      credits: "1 credit per Teammate or 6th Man reply; Arch Coach 3, or 8 for code questions",
      aliases: ["ai team", "design team", "ai workspace", "team chat", "ai chat", "chat with the team", "conversations", "my conversations", "my chats", "chat history", "previous chats", "old conversations"]
    },
    {
      id: "teammate",
      name: "Teammate",
      desc: "Your everyday design partner in the AI Team: brainstorming, space planning, materials.",
      path: ["AI Team", "Teammate"],
      go: P("ai-team", { prefill: "Teammate, " }),
      access: "member",
      status: "live",
      season: 1,
      brand: true,
      aliases: ["teammate", "talk to teammate", "ask teammate", "chat with teammate"]
    },
    {
      id: "sixth-man",
      name: "6th Man",
      desc: 'The on-demand design strategist in the AI Team. Call him in for alternative plays ("6th Man, check in").',
      path: ["AI Team", "6th Man"],
      go: P("ai-team", { prefill: "6th Man, check in." }),
      access: "member",
      status: "live",
      season: 1,
      brand: true,
      steps: ["Open the AI Team.", 'Start your message with "6th Man," or tap 6th Man on the bench.'],
      aliases: ["sixthman", "call sixthman", "talk to sixthman", "ask sixthman", "bench"]
    },
    {
      id: "locker-room",
      name: "The Locker Room",
      desc: "Saved ideas, decisions, plays and bookmarks from your AI Team conversations.",
      path: ["AI Team", "The Locker Room"],
      go: P("ai-team", { view: "locker" }),
      access: "member",
      status: "live",
      season: 1,
      brand: true,
      aliases: ["locker room", "locker", "saved ideas", "saved decisions", "bookmarks", "my bookmarks", "saved plays", "saved notes"]
    },
    {
      id: "project-memory",
      name: "Project Memory",
      desc: "What the AI Team remembers about each project.",
      path: ["AI Team", "Project Memory"],
      go: P("ai-team", { view: "memory" }),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["project memory", "ai memory", "what the team remembers", "team memory"]
    },
    {
      id: "active-generations",
      name: "Active Generations",
      desc: "Background tasks the AI Team is working on (layout options, detailed proposals, code checks).",
      path: ["AI Team", "Active Generations"],
      go: P("ai-team", { view: "jobs" }),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["active generations", "background tasks", "running jobs", "generation status", "jobs", "is my generation done"]
    },
    {
      id: "delete-conversation",
      name: "Delete a conversation",
      desc: "Remove an AI Team conversation with the trash button at the top of the conversation.",
      path: ["AI Team", "Conversations", "\u{1F5D1} Delete"],
      go: P("ai-team", { view: "chat" }),
      access: "member",
      status: "live",
      season: 1,
      steps: ["Open the AI Team and pick the conversation.", "Tap \u{1F5D1} at the top right and confirm."],
      aliases: ["delete conversation", "delete chat", "delete thread", "remove conversation", "clear chat", "delete a conversation"]
    },
    // ---- Arch Coach
    {
      id: "arch-coach",
      name: "Arch Coach",
      desc: "Code, ADA, detail and drawing questions, with saved threads, attachments and Draw it up.",
      path: ["AI Team", "Arch Coach"],
      go: P("arch-coach"),
      publicGo: { page: "coach" },
      access: "public",
      status: "live",
      season: 1,
      brand: true,
      credits: "3 credits a question, 8 for code or ADA, 30 with a picture",
      aliases: ["archcoach", "ask archcoach", "coach", "archcoach threads", "coach threads", "archcoach history"]
    },
    {
      id: "coach-creator",
      name: "Customize Arch Coach",
      desc: "Build your own Arch Coach: appearance, skills, legend and language.",
      path: ["AI Team", "Arch Coach", "Your Coach"],
      go: { fn: "coachCreator" },
      access: "member",
      status: "live",
      season: 1,
      aliases: ["customize archcoach", "customize coach", "change coach", "coach appearance", "coach skills", "build my coach", "coach builder", "coach creator", "my coach", "change coach look", "coach avatar"]
    },
    {
      id: "legends",
      name: "Hall of Fame legends",
      desc: "Pick a legend (Zaha Hadid, Paul R. Williams and more) as your go-to; some unlock with XP.",
      path: ["Dashboard", "Arch Coach legends"],
      go: { fn: "legends" },
      access: "member",
      status: "live",
      season: 1,
      brand: true,
      aliases: ["legend", "legends", "hall of fame", "choose my legend", "pick a legend", "unlock legend", "my legend", "legend bio"]
    },
    {
      id: "learning",
      name: "Arch Coach Learning",
      desc: "Your learning dashboard: progress, XP, badges and lessons.",
      path: ["AI Team", "Coach Playbook", "Learning"],
      go: { hash: "#portal/arch-coach?learn", tab: "arch-coach" },
      access: "member",
      status: "live",
      season: 1,
      aliases: ["learning", "learning dashboard", "lessons", "my xp", "xp", "badges", "my badges", "my progress", "courses", "tutorial lessons"]
    },
    {
      id: "playbook",
      name: "DrawUp Playbook",
      desc: "Learning paths, lessons, challenges and the board.",
      path: ["AI Team", "Coach Playbook"],
      go: { hash: "#portal/arch-coach?pb=1", tab: "arch-coach" },
      publicGo: { page: "coach" },
      access: "member",
      status: "live",
      season: 1,
      brand: true,
      aliases: ["playbook", "drawup playbook", "coach playbook", "learning paths", "challenges", "are study", "study room"]
    },
    {
      id: "watch-learn",
      name: "Watch & Learn",
      desc: "YouTube videos the AI Team found for members' questions, plus HQ picks. Links only, nothing is re-hosted.",
      path: ["AI Team", "Coach Playbook", "Watch & Learn"],
      go: { hash: "#portal/arch-coach?pb=watch", tab: "arch-coach" },
      access: "member",
      status: "live",
      season: 1,
      aliases: ["watch learn", "watch and learn", "videos", "youtube videos", "saved videos", "learning videos", "video shelf"]
    },
    // ---- Draw
    {
      id: "draw",
      name: "Design Workspace",
      desc: "DrawUp Draw: plans with real dimensions, markups and 3D details.",
      path: ["Draw", "Design Workspace"],
      go: P("draw"),
      publicGo: { page: "products", scroll: "#dus-p-draw" },
      access: "member",
      status: "live",
      season: 1,
      aliases: ["draw", "drawup draw", "design workspace", "drawing tool", "draw tool", "cad", "drafting"]
    },
    {
      id: "space-planning",
      name: "Space Planning",
      desc: "Make a floor plan with real dimensions in DrawUp Draw.",
      path: ["Draw", "Space Planning"],
      go: P("draw", { click: "Create plan" }),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["space planning", "space plan", "floorplan", "make floorplan", "create plan", "draw floorplan", "draw plan", "make a plan", "layout tool"]
    },
    {
      id: "draw-it-up",
      name: "Draw it up",
      desc: "A picture in, a coordinated drawing set out (plans, elevations, sections, details).",
      path: ["Draw", "Drawing Generation"],
      go: { fn: "drawItUp" },
      access: "member",
      status: "live",
      season: 1,
      brand: true,
      credits: "40 credits a set",
      steps: ["Open Draw \u203A Drawing Generation (or the \u270E Draw it up mode in Arch Coach).", "Add a picture or sketch, pick the mode, then generate."],
      aliases: ["drawitup", "drawing generation", "generate drawing", "generate drawings", "generate a drawing set", "picture to drawing", "photo to plan", "image to plan", "sketch to drawing", "turn picture into drawing", "make drawings from picture"]
    },
    {
      id: "markup",
      name: "Mark Up a File",
      desc: "Open a PDF or image and mark it up in DrawUp Draw.",
      path: ["Draw", "Mark Up a File"],
      go: P("draw", { click: "Markup a file" }),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["markup", "mark up", "mark up file", "markup pdf", "redline", "redline pdf", "annotate pdf", "mark up drawing"]
    },
    {
      id: "draw-3d-detail",
      name: "Draw a Detail in 3D",
      desc: "Draw a construction detail as a 3D assembly.",
      path: ["Draw", "Draw a Detail in 3D"],
      go: P("draw", { click: "New detail" }),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["3d detail", "draw 3d detail", "detail in 3d", "new 3d detail", "my 3d details"]
    },
    // ---- CheckUp
    {
      id: "checkup",
      name: "CheckUp",
      desc: "Plan review: code compliance, ADA accessibility, life safety and drawing set checks with findings and reports.",
      path: ["CheckUp"],
      go: P("check"),
      publicGo: { page: "check" },
      access: "member",
      status: "live",
      season: 1,
      brand: true,
      credits: "30 credits up to 10 pages, 150 over 10 pages",
      aliases: ["checkup", "drawup check", "plan review", "plan check", "review my drawings", "check my drawings", "check my plans", "code check", "drawing review", "compliance check"]
    },
    {
      id: "quick-check",
      name: "Quick Check",
      desc: "Upload one sheet and see what is wrong and how it should look.",
      path: ["CheckUp", "Quick Check"],
      go: { tab: "check", hash: "#portal/check?quick=1" },
      access: "member",
      status: "live",
      season: 1,
      brand: true,
      aliases: ["quick check", "check a sheet", "check one sheet", "quick check sheet", "check it"]
    },
    {
      id: "checkup-reports",
      name: "CheckUp reports",
      desc: "Every check you ran, with its findings and the report.",
      path: ["CheckUp", "Findings and Reports"],
      go: P("check", { scroll: "Your checks" }),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["checkup report", "checkup reports", "previous checkup", "previous checkup reports", "past checks", "old checks", "my checks", "check results", "findings", "findings report", "my reports", "review report", "check history"]
    },
    {
      id: "checkup-ada",
      name: "ADA Accessibility check",
      desc: "Start a CheckUp focused on accessibility.",
      path: ["CheckUp", "ADA Accessibility"],
      go: P("check", { click: "Accessibility", scroll: "New check" }),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["ada check", "accessibility check", "check ada", "ada review", "check accessibility"]
    },
    {
      id: "checkup-code",
      name: "Code Compliance check",
      desc: "Start a CheckUp against the building code.",
      path: ["CheckUp", "Code Compliance"],
      go: P("check", { click: "Building code", scroll: "New check" }),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["code compliance check", "building code check", "code review", "check building code", "ibc check"]
    },
    {
      id: "checkup-life-safety",
      name: "Life Safety check",
      desc: "Start a CheckUp for life safety and egress.",
      path: ["CheckUp", "Life Safety"],
      go: P("check", { click: "Life safety / egress", scroll: "New check" }),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["life safety check", "egress check", "check egress", "life safety review"]
    },
    {
      id: "narrative-review",
      name: "Narrative review",
      desc: "Check a design narrative, or a narrative against your plans.",
      path: ["CheckUp", "Design narrative review"],
      go: P("check", { click: "Design narrative review", scroll: "New check" }),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["narrative review", "design narrative", "narrative vs plans", "check narrative", "review narrative"]
    },
    // ---- Swap
    {
      id: "swap",
      name: "DrawUp Swap",
      desc: "Change materials, light and time of day on a real picture; photoreal renders.",
      path: ["Swap"],
      go: P("swap"),
      publicGo: { page: "swap" },
      access: "member",
      status: "live",
      season: 1,
      brand: true,
      credits: "100 credits an image (refunded if it fails)",
      aliases: ["swap", "drawup swap", "material swap", "change materials", "swap materials", "photoreal render", "render", "rendering", "interior visualization", "saved visualizations", "new swap", "lets play"]
    },
    // ---- Details
    {
      id: "details",
      name: "DrawUp Details",
      desc: "The detail library: DrawUp 2D, DrawUp 3D, your 3D details and your firm's details.",
      path: ["Details"],
      go: P("details"),
      publicGo: { page: "details" },
      access: "member",
      status: "live",
      season: 1,
      brand: true,
      steps: ["Open Details in the top menu.", "Switch between DrawUp 2D, DrawUp 3D, My 3D and Firm."],
      aliases: ["details", "detail library", "details library", "drawup 2d", "drawup 3d", "construction details", "standard details", "typical details", "library"]
    },
    {
      id: "draw-a-detail",
      name: "Draw a detail from a picture",
      desc: "Upload one detail and get the flaws, the fixes and a clean drawing.",
      path: ["Details", "Draw a detail from a picture"],
      go: P("details", { scroll: "Upload one detail" }),
      access: "member",
      status: "live",
      season: 1,
      credits: "15 credits",
      aliases: ["draw detail", "draw a detail", "upload detail", "upload a detail", "fix my detail", "detail from picture", "redraw detail"]
    },
    {
      id: "detail-lookup",
      name: "Find a detail by sheet reference",
      desc: "Type a reference like D4-A601 to open that detail.",
      path: ["Details", "Find by sheet reference"],
      go: P("details", { focus: 'input[placeholder*="A601"],input[placeholder*="sheet"]' }),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["sheet reference", "find detail by sheet", "detail reference", "detail number", "find a detail"]
    },
    {
      id: "firm-details",
      name: "Firm Details library",
      desc: "Details shared inside your firm.",
      path: ["Details", "Firm Details"],
      go: P("details", { click: "Firm" }),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["firm details", "firm detail library", "office details", "our details"]
    },
    {
      id: "vdi",
      name: "Visual Detail Intelligence",
      desc: "Find the Flaws, Understand the Fix, DrawUp Ready: a full detail review with code, references and a corrected 2D + 3D detail.",
      path: ["Details", "Review a detail"],
      go: { fn: "vdi" },
      access: "member",
      status: "live",
      season: 1,
      brand: true,
      credits: "20 credits a review",
      aliases: ["visual detail intelligence", "find the flaws", "understand the fix", "detail review", "review my detail", "review a detail", "flaws in my detail"]
    },
    // ---- Discover
    {
      id: "discover",
      name: "Discover",
      desc: "Browse projects, firms, people and universities on DrawUp.",
      path: ["Discover"],
      go: P("discover"),
      publicGo: { page: "discover" },
      access: "public",
      status: "live",
      season: 1,
      credits: "Free",
      aliases: ["discover", "browse", "explore"]
    },
    {
      id: "discover-firms",
      name: "Firms",
      desc: "Find architecture, engineering and construction firms.",
      path: ["Discover", "Firms"],
      go: P("discover", { sub: "firms" }),
      publicGo: { page: "discover", sub: "firms" },
      access: "public",
      status: "live",
      season: 1,
      aliases: ["firms", "find firm", "find a firm", "firm search", "architecture firms", "browse firms"]
    },
    {
      id: "discover-people",
      name: "People",
      desc: "Find people on DrawUp by name, firm or role.",
      path: ["Discover", "People"],
      go: P("discover", { sub: "people" }),
      publicGo: { page: "discover", sub: "people" },
      access: "public",
      status: "live",
      season: 1,
      aliases: ["people", "find people", "find someone", "find a person", "people search", "members", "find architect"]
    },
    {
      id: "discover-universities",
      name: "Universities",
      desc: "University pages and campus portals.",
      path: ["Discover", "Universities"],
      go: P("discover", { sub: "universities" }),
      publicGo: { page: "discover", sub: "universities" },
      access: "public",
      status: "live",
      season: 1,
      aliases: ["universities", "university", "schools", "campus", "architecture schools", "my school"]
    },
    {
      id: "discover-projects",
      name: "Discover projects",
      desc: "Browse public projects and buildings.",
      path: ["Discover", "Projects"],
      go: P("discover", { sub: "projects" }),
      publicGo: { page: "discover", sub: "projects" },
      access: "public",
      status: "live",
      season: 1,
      aliases: ["browse projects", "public projects", "other projects", "showcase projects", "buildings"]
    },
    {
      id: "resources",
      name: "Resources",
      desc: "Codes, AIA & NOMA, education and international references.",
      path: ["Resources"],
      publicGo: { page: "resources" },
      go: P("discover"),
      access: "public",
      status: "live",
      season: 1,
      aliases: ["resources", "code resources", "aia noma", "documentation", "reference links"]
    },
    // ---- Connect
    {
      id: "connect",
      name: "Connect",
      desc: "Messages, group chats, firm chats, timeline, boards, vendors and Lunch and Learns.",
      path: ["Connect"],
      go: P("connect"),
      publicGo: { page: "connect" },
      access: "member",
      status: "live",
      season: 1,
      brand: true,
      aliases: ["connect", "community", "timeline", "feed", "social", "posts"]
    },
    {
      id: "messages",
      name: "Messages",
      desc: "Direct messages with other members.",
      path: ["Connect", "Messages"],
      go: P("connect", { click: "Messages" }),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["messages", "message someone", "send message", "direct message", "dm", "inbox", "my messages", "chat with someone"]
    },
    {
      id: "group-chats",
      name: "Group Chats",
      desc: "Group chats and firm chats.",
      path: ["Connect", "Group Chats"],
      go: P("connect", { click: "Group chats" }),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["group chat", "group chats", "firm chat", "firm chats", "start group chat"]
    },
    {
      id: "boards",
      name: "Boards",
      desc: "Discussion boards.",
      path: ["Connect", "Boards"],
      go: P("connect", { click: "Boards" }),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["boards", "board", "forum", "discussion board", "discussions"]
    },
    {
      id: "vendors",
      name: "Vendors",
      desc: "Vendors and manufacturers on DrawUp.",
      path: ["Connect", "Vendors"],
      go: P("connect", { click: "Vendors" }),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["vendors", "vendor", "manufacturers", "suppliers", "product reps"]
    },
    {
      id: "lunch-learns",
      name: "Lunch and Learns",
      desc: "Lunch and Learn sessions.",
      path: ["Connect", "Lunch and Learns"],
      go: P("connect", { click: "Lunch and Learns" }),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["lunch and learn", "lunch learn", "lunch and learns", "lunch learns"]
    },
    // ---- Firm
    {
      id: "firm",
      name: "Firm Workspace",
      desc: "Your firm's workspace: playbook, team, shared resources and presentations.",
      path: ["Firm", "Firm Workspace"],
      go: P("firm"),
      publicGo: { page: "firms" },
      access: "member",
      status: "live",
      season: 1,
      aliases: ["firm", "firm workspace", "my firm", "firm page", "firm profile", "office workspace", "claim firm", "claim my firm"]
    },
    {
      id: "firm-playbook",
      name: "Firm Playbook",
      desc: "Your firm's standards and playbook (firm admins edit it).",
      path: ["Firm", "Firm Playbook"],
      go: { tab: "firm", hash: "#portal/firm?pane=playbook" },
      access: "member",
      status: "live",
      season: 1,
      note: "Firm admins can edit it.",
      aliases: ["firm playbook", "firm standards", "office standards", "cad standards"]
    },
    {
      id: "team-management",
      name: "Team Management",
      desc: "Your coworkers on DrawUp and firm membership.",
      path: ["Firm", "Team Management"],
      go: P("team"),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["team management", "my team", "coworkers", "invite coworker", "invite team", "add team member", "roster", "firm roster", "seats"]
    },
    {
      id: "shared-resources",
      name: "Shared Resources",
      desc: "Files and resources shared inside your firm.",
      path: ["Firm", "Shared Resources"],
      go: { tab: "firm", hash: "#portal/firm?pane=library" },
      access: "member",
      status: "live",
      season: 1,
      aliases: ["shared resources", "firm library", "shared files", "firm files"]
    },
    {
      id: "gm-presentation",
      name: "GM Presentation",
      desc: "Firm presentation mode (firm admins).",
      path: ["Firm", "GM Presentation"],
      go: { tab: "firm", hash: "#portal/firm?pane=present" },
      access: "member",
      status: "live",
      season: 1,
      note: "For firm admins.",
      aliases: ["gm presentation", "presentation mode", "firm presentation"]
    },
    // ---- account
    {
      id: "profile",
      name: "Your profile",
      desc: "Your DrawUp profile: name, title, firm, school, credentials and career timeline.",
      path: ["Avatar menu", "View / Edit Profile"],
      go: P("profile"),
      access: "member",
      status: "live",
      season: 1,
      steps: ["Tap your avatar at the top right.", "Choose View / Edit Profile."],
      aliases: ["profile", "my profile", "edit profile", "change profile", "profile picture", "change my name", "change name", "change photo", "update profile", "my credentials", "career timeline", "username", "change username"]
    },
    {
      id: "account",
      name: "Account & Billing",
      desc: "Your plan, monthly and purchased credits, access and sign-out.",
      path: ["Avatar menu", "Account & Billing"],
      go: P("account"),
      access: "member",
      status: "live",
      season: 1,
      steps: ["Tap your avatar at the top right.", "Choose Account & Billing."],
      aliases: ["account", "account settings", "settings", "billing", "account billing", "my account", "my credits", "credit balance", "how many credits", "credits left", "remaining credits", "my plan", "current plan", "usage", "sign out", "log out", "logout", "signout"]
    },
    {
      id: "subscription",
      name: "Change your plan",
      desc: "Plans and prices are on the Pricing page; your current plan is in Account & Billing.",
      path: ["Avatar menu", "Account & Billing"],
      go: P("account"),
      publicGo: { page: "pricing" },
      access: "public",
      status: "limited",
      season: 1,
      note: "Plan changes are not self-serve in the app yet: there is no checkout connected. Compare plans on the Pricing page and contact DrawUp to switch or cancel.",
      aliases: ["change plan", "change my plan", "upgrade", "upgrade plan", "downgrade", "cancel plan", "cancel subscription", "switch plan", "buy credits", "more credits", "get more credits", "student plan", "plan price", "pricing", "plans", "subscribe", "billing plan", "renew plan"]
    },
    {
      id: "credits",
      name: "How credits work",
      desc: "Every AI action shows its cost before it runs, and failed jobs refund automatically. Questions about using DrawUp are always free.",
      path: ["Pricing", "Credits"],
      go: P("account"),
      publicGo: { page: "pricing", scroll: "Credits" },
      access: "public",
      status: "live",
      season: 1,
      aliases: ["how credits work", "credit cost", "credits cost", "what costs credits", "why charged", "charged credits", "credit refund", "refund credits", "credit prices", "how much does it cost"]
    },
    {
      id: "signin",
      name: "Sign in or join",
      desc: "Sign in, or create a free Explore account (50 credits).",
      path: ["Sign in"],
      publicGo: { fn: "signin" },
      go: P("dashboard"),
      access: "public",
      status: "live",
      season: 1,
      aliases: ["sign in", "signin", "log in", "login", "create account", "sign up", "signup", "join", "register", "join preseason", "make an account"]
    },
    {
      id: "help-center",
      name: "Help Center",
      desc: "Questions and answers about DrawUp.",
      path: ["Resources", "Help Center"],
      publicGo: { page: "qa" },
      access: "public",
      status: "live",
      season: 1,
      aliases: ["help center", "faq", "help page", "support", "contact support", "tutorials"]
    },
    {
      id: "ai-policy",
      name: "AI policy",
      desc: "How DrawUp uses AI.",
      path: ["Resources", "AI policy"],
      publicGo: { page: "ai-policy" },
      access: "public",
      status: "live",
      season: 1,
      aliases: ["ai policy", "privacy", "privacy policy", "terms", "terms of service", "data policy"]
    },
    // ---- more menu destinations (each one is an item in the DrawUp menu)
    {
      id: "example-plan",
      name: "The example plan",
      desc: "Open the example floor plan in DrawUp Draw to try the tools.",
      path: ["Draw", "The example plan"],
      go: P("draw", { click: "Open example plan" }),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["example plan", "sample plan", "demo plan", "try draw"]
    },
    {
      id: "my-3d-details",
      name: "My 3D details",
      desc: "The 3D details you drew.",
      path: ["Draw", "My 3D details"],
      go: P("draw", { click: "My details" }),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["my 3d details", "my details", "my detail drawings", "saved 3d details"]
    },
    {
      id: "drawing-review",
      name: "Drawing set check",
      desc: "Start a CheckUp of a whole drawing set.",
      path: ["CheckUp", "Drawing Review"],
      go: P("check", { click: "Drawing set check", scroll: "New check" }),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["drawing set check", "check drawing set", "check my set", "set review", "qa qc", "qaqc"]
    },
    {
      id: "narrative-vs-plans",
      name: "Narrative vs. plans",
      desc: "Check a narrative against your plans.",
      path: ["CheckUp", "Narrative vs. plans"],
      go: P("check", { click: "Narrative vs. plans", scroll: "New check" }),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["narrative vs plans", "narrative against plans", "compare narrative and plans"]
    },
    {
      id: "photoreal",
      name: "Photoreal Render",
      desc: "Turn a picture or model view into a photoreal render in Swap.",
      path: ["Swap", "Photoreal Render"],
      go: P("swap", { click: "Photoreal render" }),
      access: "member",
      status: "live",
      season: 1,
      credits: "100 credits an image (refunded if it fails)",
      aliases: ["photoreal render", "photorealistic render", "make a render", "render my model", "realistic render"]
    },
    {
      id: "material-changes",
      name: "Material Changes",
      desc: "Swap materials on a real picture.",
      path: ["Swap", "Material Changes"],
      go: P("swap", { click: "Materials" }),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["material changes", "try materials", "change finishes", "swap finishes", "change flooring in picture"]
    },
    {
      id: "my-3d",
      name: "My 3D (Details)",
      desc: "Your own 3D details in the Details library.",
      path: ["Details", "My 3D"],
      go: P("details", { click: "My 3D" }),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["my 3d", "my uploaded details"]
    },
    {
      id: "detail-reviews",
      name: "Detail reviews and comments",
      desc: "Comments and architect verifications on details.",
      path: ["Details", "Reviews and comments"],
      go: P("details", { click: "Reviews + comments" }),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["detail reviews", "detail comments", "verify detail", "detail verification", "reviews and comments"]
    },
    {
      id: "timeline",
      name: "Timeline",
      desc: "The Connect timeline: posts from people and firms.",
      path: ["Connect", "Timeline"],
      go: P("connect", { click: "Timeline" }),
      access: "member",
      status: "live",
      season: 1,
      aliases: ["timeline", "news feed", "make a post", "post something", "share a post"]
    },
    {
      id: "firm-locations",
      name: "Locations & studios",
      desc: "Your firm's offices and studios (firm admins).",
      path: ["Firm", "Locations & studios"],
      go: { tab: "firm", hash: "#portal/firm?pane=units" },
      access: "member",
      status: "live",
      season: 1,
      note: "For firm admins.",
      aliases: ["locations", "offices", "studios", "firm locations", "add office", "add studio"]
    },
    {
      id: "about",
      name: "What is DrawUp?",
      desc: "What DrawUp is and how it works.",
      path: ["Discover", "What is DrawUp?"],
      publicGo: { page: "home", scroll: "#dus-about" },
      go: P("dashboard"),
      access: "public",
      status: "live",
      season: 1,
      brand: true,
      aliases: ["what is drawup", "about drawup", "how drawup works", "drawup features", "why drawup", "features"]
    },
    {
      id: "solutions",
      name: "Solutions",
      desc: "How DrawUp works for students, architects, firms, engineers and educators.",
      path: ["Solutions"],
      publicGo: { page: "solutions" },
      go: P("dashboard"),
      access: "public",
      status: "live",
      season: 1,
      aliases: ["solutions", "for students", "for architects", "for educators", "for engineers", "drawup for students"]
    },
    {
      id: "code-resources",
      name: "Code resources",
      desc: "Links to building codes, AIA & NOMA, education and international references.",
      path: ["Resources", "Codes"],
      publicGo: { page: "resources", sub: "codes" },
      go: P("discover"),
      access: "public",
      status: "live",
      season: 1,
      aliases: ["code links", "building code links", "code resources", "where are the codes", "aia", "noma", "education resources", "international codes"]
    },
    {
      id: "compare-plans",
      name: "Compare plans",
      desc: "The feature table for every plan.",
      path: ["Pricing", "Compare Features"],
      publicGo: { page: "pricing", scroll: "table" },
      go: P("account"),
      access: "public",
      status: "live",
      season: 1,
      aliases: ["compare plans", "compare features", "plan comparison", "what is in each plan", "plan features"]
    },
    // ---- Season 1 features still being built (never shown with an Open button until they ship)
    {
      id: "portfolio-review",
      name: "Portfolio Review",
      desc: "Upload a portfolio PDF and get a scored review with page notes, goals (internship, school, employment) and an exported report.",
      path: ["Discover", "Portfolio Review"],
      go: P("portfolio"),
      access: "member",
      status: "building",
      season: 1,
      brand: true,
      note: "Portfolio Review is being rebuilt for Season 1 and is not open yet. The Student Portfolio Review box on the public Arch Coach page only accepts the file for now; it does not run a review. When it opens it will be under Discover and on your Dashboard.",
      // The browser opens it as live only when all three are there: the Portfolio tab, the Discover menu item and its code.
      detect: { nav: "Portfolio Review", global: "DrawUpPortfolio" },
      aliases: ["portfolio review", "portfolio", "review portfolio", "review my portfolio", "portfolio check", "portfolio feedback", "portfolio critique", "upload portfolio", "student portfolio", "portfolio arch check"]
    },
    {
      id: "specs",
      name: "DrawUp Specs",
      desc: "Write and keep project specifications with your firm, linked to your drawings and checks, and export them.",
      path: ["Firm", "DrawUp Specs"],
      go: { tab: "firm", hash: "#portal/firm?pane=specs" },
      access: "member",
      status: "building",
      season: 1,
      brand: true,
      note: "When it opens it will be in your Firm workspace.",
      // opens as live in the browser once its code is on the page
      detect: { global: "DrawUpSpecs" },
      aliases: ["drawup specs", "specs", "specifications", "spec book", "project manual", "spec writer", "specification writer", "my specs"]
    },
    // ---- founder only
    {
      id: "hq",
      name: "DrawUp HQ",
      desc: "Founder console: accounts, content, deletion log and the help registry.",
      path: ["HQ"],
      go: P("hq"),
      access: "hq",
      status: "live",
      season: 1,
      aliases: ["hq", "drawup hq", "admin", "admin panel", "founder console", "owner console"]
    },
    {
      id: "help-registry",
      name: "Help registry",
      desc: "Review the feature registry, navigation paths, availability and help answers; publish changes.",
      path: ["HQ", "Help registry"],
      go: { tab: "hq", hash: "#portal/hq?pane=help-registry" },
      access: "hq",
      status: "live",
      season: 1,
      aliases: ["help registry", "feature registry", "edit help answers", "support responses", "navigation registry"]
    },
    // ---- tasks with several places (one button per place)
    {
      id: "task-upload",
      name: "Upload a drawing",
      desc: "Where to upload depends on what you want DrawUp to do with it.",
      path: [],
      access: "member",
      status: "live",
      season: 1,
      options: ["quick-check", "checkup", "markup", "draw-a-detail", "draw-it-up"],
      aliases: ["upload", "upload drawing", "upload a drawing", "upload drawings", "upload pdf", "upload a pdf", "upload plans", "upload my plans", "upload a sheet", "upload file", "upload picture", "add drawing", "import drawing", "import pdf", "attach drawing"]
    },
    {
      id: "task-review-drawings",
      name: "Get my drawings reviewed",
      desc: "Pick the review that fits.",
      path: [],
      access: "member",
      status: "live",
      season: 1,
      options: ["quick-check", "checkup", "vdi"],
      aliases: ["get feedback on drawings", "feedback on my drawings", "review my drawing", "critique my drawing", "check my sheet"]
    }
  ];
  var byId = new Map(FEATURES.map((f) => [f.id, f]));
  var featureById = (id) => byId.get(id) || null;
  function withOverrides(list) {
    if (!(list == null ? void 0 : list.length)) return FEATURES;
    const map = new Map(list.map((o) => [o.feature_id, o]));
    return FEATURES.flatMap((f) => {
      var _a;
      const o = map.get(f.id);
      if (!o) return [f];
      if (o.hidden) return [];
      const STATUSES = ["live", "limited", "building", "season2", "off"];
      return [{ ...f, status: STATUSES.includes(o.status) ? o.status : f.status, note: (_a = o.note) != null ? _a : f.note, desc: o.answer || f.desc, aliases: [...f.aliases, ...(o.aliases || []).map(String).slice(0, 30)] }];
    });
  }
  var PHRASES = [
    [/\b(?:6th|sixth|six)[\s-]*man\b/g, "sixthman"],
    [/\barch[\s-]*coach\b/g, "archcoach"],
    [/\bdraw(?:ing)? it up\b/g, "drawitup"],
    [/\bcheck[\s-]+ups?\b/g, "checkup"],
    [/\bcheckups\b/g, "checkup"],
    [/\bdrawup ready\b/g, "drawup ready"],
    [/\bfloor[\s-]*plans?\b/g, "floorplan"],
    [/\bsign[\s-]+in\b/g, "signin"],
    [/\bsign[\s-]+up\b/g, "signup"],
    [/\blog[\s-]+in\b/g, "login"],
    [/\blog[\s-]+out\b/g, "logout"],
    [/\bsign[\s-]+out\b/g, "signout"],
    [/\bmark[\s-]+up\b/g, "markup"],
    [/\bred[\s-]+line\b/g, "redline"],
    [/\bwatch (?:&|and|n) learn\b/g, "watch learn"],
    [/\blunch (?:&|and|n) learns?\b/g, "lunch learn"],
    [/\bsubscriptions?\b|\bmemberships?\b/g, "plan"],
    [/\bpictures?\b|\bphotos?\b|\bimages?\b|\bpics?\b|\bscreenshots?\b/g, "picture"],
    [/\bpreferences\b/g, "settings"],
    [/\bconvos?\b|\bthreads\b/g, "conversations"],
    [/\bai[\s-]+design[\s-]+team\b/g, "ai team"]
  ];
  var CONTRACTIONS = [[/\b(where|what|how|who|it|that|there)'s\b/g, "$1 is"], [/\bcan'?t\b/g, "cannot"], [/\bdon'?t\b/g, "do not"], [/\bdoesn'?t\b/g, "does not"], [/\bi'?m\b/g, "i am"], [/\bwheres\b/g, "where is"], [/\bwanna\b/g, "want to"]];
  var STOP = new Set("i me my mine we our you your the a an to do does did can could would should will is are was be been am of for in on at it its this that these those there here what which please pls drawup thing things page section tab menu button option area place located location some any get go going find found open opening see view access use using want need like way show take bring navigate where how who when why with from into by and or so just then also now again help me able possible app site website portal inside within".split(" "));
  var KEEP_SHORT = /* @__PURE__ */ new Set(["3d", "2d", "ai", "ada", "cd", "dm", "gm", "hq", "xp", "faq", "ibc", "pdf"]);
  function stem(t) {
    if (t.length > 4 && t.endsWith("ies")) t = t.slice(0, -3) + "y";
    else if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) t = t.slice(0, -1);
    if (t.length > 5 && t.endsWith("ing")) t = t.slice(0, -3);
    return t;
  }
  function normalize(q) {
    let s = " " + String(q || "").toLowerCase().replace(/[’‘`]/g, "'").replace(/[“”]/g, '"') + " ";
    for (const [re, to] of CONTRACTIONS) s = s.replace(re, to);
    for (const [re, to] of PHRASES) s = s.replace(re, to);
    return s.replace(/[^a-z0-9' ]+/g, " ").replace(/'/g, "").replace(/\s+/g, " ").trim();
  }
  function contentTokens(norm) {
    return norm.split(" ").filter((t) => t && !STOP.has(t) && (t.length > 1 || KEEP_SHORT.has(t))).map(stem);
  }
  var NAV_RE = /^(?:(?:hey|hi|yo|ok|okay|so|um|quick question)[ ,]+)?(?:(?:archcoach|coach|teammate|sixthman|drawup)[ ,]+)?(?:where\b|how (?:do|can|would|should|could) (?:i|we|you)\b|how to\b|how (?:do|can) i get to\b|take me\b|bring me\b|go to\b|goto\b|open\b|navigate\b|show me (?:where|how)\b|i cannot find\b|i can not find\b|cannot find\b|i (?:need|want) to (?:find|get to|open|go to|see|access|change|upload|start|create|delete|cancel|edit|review|use)\b|is there (?:a|an|any)\b|does drawup (?:have|offer|do|support)\b|do you (?:have|guys have)\b|can i (?:upload|change|delete|see|find|use|access|get|review|open|create|start|cancel|invite|edit|export|switch|buy|message|customize|unlock|pick|choose)\b|help me (?:find|get to|open)\b|what (?:is|are) the (?:url|link|page)\b|which (?:page|tab|menu)\b|link to\b|launch\b|i am looking for\b|looking for\b|lost\b|stuck finding\b)/;
  var SUPPORT_RE = /\b(?:how many|how much|do i have|why (?:was|did|am|were|is) (?:i|it|my)|am i (?:being )?charged|is it free|does it cost|what does it cost)\b/;
  var DESIGN_WHERE = /\bwhere (?:should|would|could|can) (?:the|a|an|this|that|we|it|my|our|i put|i place|i locate)\b(?! find| get| see| open| go to| access)/;
  var NAV_ANY = /\b(?:where (?:is|are|do|can|did|would|should)|how do i (?:get to|find|open|access|reach)|take me to|in the menu|which tab|what tab|in drawup|on drawup|inside drawup)\b/;
  var ABOUT_RE = /^(?:what (?:is|are|does)|what s|tell me about|explain|how does)\b/;
  var TECH_RE = /\b(?:ibc|irc|nfpa|code section|egress width|occupant load|r value|u factor|flashing|sill pan|parapet|coping|footing|rebar|beam|joist|header size|stud|sheathing|vapor|insulation|membrane|slope|setback|zoning|span|load|seismic|wind|fire rating|clearance|turning radius|toilet|grab bar|handrail height|riser|tread|calculate|sizing|thickness|spacing|dimension of|restroom|bathroom|kitchen|lobby|stair|corridor|ramp)\b/;
  function scoreAll(tokens, norm, list) {
    const set = new Set(tokens), out = [];
    for (const f of list) {
      let best = 0, bestCover = 0;
      for (const a of [f.name, ...f.aliases]) {
        const an = normalize(a), at = contentTokens(an);
        if (!at.length) continue;
        if (!at.every((t) => set.has(t))) continue;
        let s = at.length * 2;
        if (` ${norm} `.includes(` ${an} `)) s += 1 + Math.min(2, an.split(" ").length - at.length) * 0.5;
        if (s > best) {
          best = s;
          bestCover = at.length;
        }
      }
      if (best) out.push({ f, score: best, cover: bestCover });
    }
    return out.sort((a, b) => b.score - a.score || b.cover - a.cover);
  }
  function answerHelp(question, ctx = {}, list = FEATURES) {
    if (/\b(?:check(?:ing)? in|get in here|draw (?:me )?up (?:a |some |another )?plays?|take (?:the|that|this) shot)\b/i.test(String(question || ""))) return null;
    const raw = String(question || "").trim().replace(/^(?:(?:hey|yo|ok|okay|hi)[\s,]+)?(?:arch[\s-]*coach|coach|teammate|6th[\s-]*man|sixth[\s-]*man)\s*[,:]\s*/i, "").replace(/,\s*(?:arch[\s-]*coach|coach|teammate|6th[\s-]*man|sixth[\s-]*man)\s*[?!.]*\s*$/i, "?");
    if (!raw || raw.length > 300) return null;
    const norm = normalize(raw), tokens = contentTokens(norm);
    const nav = (NAV_RE.test(norm) || NAV_ANY.test(norm) || SUPPORT_RE.test(norm)) && !DESIGN_WHERE.test(norm);
    const about = ABOUT_RE.test(norm);
    const scored = scoreAll(tokens, norm, list);
    const top = scored[0];
    if (!tokens.length || !top) {
      if (nav && !tokens.length && !ctx.hasHistory && /\b(?:where|find|open|take me|go to|looking for|lost)\b/.test(norm)) return clarify(list, ctx, "Happy to point you there. What are you looking for?");
      return null;
    }
    const coverage = top.cover / tokens.length;
    const tech = TECH_RE.test(norm);
    const exactName = coverage === 1 && tokens.length <= 4;
    let ok = false;
    if (nav && coverage >= 0.5 && !(tech && coverage < 1)) ok = true;
    else if (exactName && !tech) ok = true;
    else if (about && top.f.brand && coverage >= 0.6 && !tech) ok = true;
    if (!ok) return null;
    const close = scored.filter((s) => s.score >= top.score - 0.5 && s.f.id !== top.f.id && !(top.f.options || []).includes(s.f.id) && !(s.f.options || []).includes(top.f.id));
    if (close.length && !top.f.options) {
      const picks = [top, ...close].slice(0, 4).map((s) => s.f);
      if (new Set(picks.map((p) => p.path[0])).size > 1 || picks.length > 2) return clarify(picks, ctx, "A couple of places match. Which one did you mean?", top.score);
    }
    return build(top.f, ctx, list, top.score);
  }
  var INTRO = { teammate: "Got you.", sixth_man: "Here's the play.", coach: "Here's where that lives.", legend: "", guest: "" };
  function opt(f, ctx) {
    const live = f.status === "live" || f.status === "limited";
    const allowed = f.access !== "hq" || !!ctx.hq;
    const go = !live || !allowed ? null : ctx.signedIn ? f.go || f.publicGo || null : f.access === "public" ? f.publicGo || f.go || null : { fn: "signin" };
    return { id: f.id, name: f.name, path: f.path, go, status: f.status, note: live ? void 0 : f.note };
  }
  function statusWords(s) {
    return s === "building" ? "being built for Season 1" : s === "season2" ? "planned for Season 2" : s === "off" ? "turned off right now" : s === "limited" ? "available with limits" : "live";
  }
  function answerFor(id, ctx = {}, list = FEATURES) {
    const f = list.find((x) => x.id === id);
    return f ? build(f, ctx, list, 0) : null;
  }
  function build(f, ctx, list, score) {
    const base = { credits: 0, score, registry: REGISTRY_VERSION, intro: INTRO[ctx.speaker || ""] || "" };
    if (f.options) {
      const options = f.options.map((id) => list.find((x) => x.id === id)).filter(Boolean).map((x) => opt(x, ctx)).filter((o2) => o2.status !== "off");
      return { ...base, kind: "options", feature: f.id, name: f.name, text: `${f.desc} Here are the places in DrawUp:`, options };
    }
    if (f.access === "hq" && !ctx.hq) return { ...base, kind: "restricted", feature: f.id, name: f.name, text: `${f.name} is only for DrawUp HQ accounts.` };
    const where = f.path.length ? f.path.join(" \u203A ") : f.name;
    if (f.status !== "live" && f.status !== "limited") {
      return {
        ...base,
        kind: "status",
        feature: f.id,
        name: f.name,
        status: f.status,
        path: f.path,
        go: null,
        note: f.note,
        text: `${f.name} is ${statusWords(f.status)}, so there is nothing to open yet. ${f.note || ""}`.trim()
      };
    }
    const o = opt(f, ctx);
    const needsSignin = !ctx.signedIn && f.access !== "public";
    const text = `${f.path.length ? "Go to " + where + "." : f.name + "."} ${f.desc}${needsSignin ? " Sign in first to open it." : ""}${f.status === "limited" && f.note ? " " + f.note : ""}`;
    return {
      ...base,
      kind: "answer",
      feature: f.id,
      name: f.name,
      text,
      path: f.path,
      go: o.go,
      open_label: needsSignin ? "Sign in to open" : `Open ${f.name}`,
      steps: f.steps,
      status: f.status,
      note: f.status === "limited" ? f.note : f.note && f.access !== "public" ? f.note : void 0,
      uses: f.credits
    };
  }
  var COMMON = ["projects", "ai-team", "arch-coach", "checkup-reports", "details", "account"];
  function clarify(listOrPicks, ctx, question, score = 0) {
    const picks = listOrPicks.length <= 4 ? listOrPicks : COMMON.map((id) => listOrPicks.find((f) => f.id === id)).filter(Boolean);
    return { kind: "clarify", text: question, options: picks.map((f) => opt(f, ctx)), credits: 0, score, registry: REGISTRY_VERSION, intro: INTRO[ctx.speaker || ""] || "" };
  }
  function helpText(a) {
    var _a, _b;
    const lines = [a.intro ? a.intro + " " + a.text : a.text];
    if (((_a = a.steps) == null ? void 0 : _a.length) && a.kind === "answer") lines.push(a.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"));
    if ((_b = a.options) == null ? void 0 : _b.length) lines.push(a.options.map((o) => `\u2022 ${o.name}${o.path.length ? " (" + o.path.join(" \u203A ") + ")" : ""}${o.go ? "" : " (" + statusWords(o.status) + ")"}`).join("\n"));
    lines.push("This answer was free: no credits used.");
    return lines.join("\n\n");
  }
  function platformBrief(question, list = FEATURES) {
    const norm = normalize(question), tokens = contentTokens(norm);
    const rel = scoreAll(tokens, norm, list).slice(0, 5).map((s) => s.f);
    const line = (f) => `- ${f.name}: ${f.path.join(" \u203A ") || "(several places)"} \xB7 ${statusWords(f.status)}${f.access === "hq" ? " \xB7 HQ only" : ""}. ${f.desc}${f.status !== "live" && f.note ? " " + f.note : ""}`;
    const core = list.filter((f) => !f.options && f.access !== "hq" && (f.path.length <= 1 || ["portfolio-review", "checkup-reports", "draw-it-up", "quick-check", "subscription", "locker-room", "draw-a-detail", "vdi", "markup", "profile", "account"].includes(f.id)) && !rel.includes(f));
    return `DRAWUP PLATFORM (verified feature registry ${REGISTRY_VERSION}). You work INSIDE DrawUp, the architecture studio app the user is using right now; you are not a generic chatbot.
- When the user wants to do something DrawUp can do, point them to it in DrawUp by its menu path (below). Never send them to Behance, LinkedIn, Issuu, Canva, Dribbble, Archinect or any other outside service for something DrawUp does.
- Only mention DrawUp features, pages, buttons and prices listed here. Never invent a page, route or feature, and never say a feature works when it is being built or turned off; give its status instead.
- Questions about how to use DrawUp are free. Do not mention credits unless the user asks.
${rel.length ? "MOST RELEVANT TO THIS QUESTION:\n" + rel.map(line).join("\n") + "\n" : ""}MENU MAP:
${core.map(line).join("\n")}`;
  }
  return __toCommonJS(drawup_help_exports);
})();
