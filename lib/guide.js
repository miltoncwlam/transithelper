export const GUIDE = {
  zh: {
    title: '使用說明',
    pdf: '完整使用手冊（PDF）',
    intro: 'TransitBuddy 顯示香港巴士、專線小巴、嶼巴、港鐵及輕鐵的實時到站。預設繁體中文。沒有的班次就會寫沒有，不會編造時間。',
    sections: [
      {
        h: '巴士／小巴到站',
        p: [
          '輸入路線號碼後按查詢。正在行駛的班次會排在前面；你輸入的號碼（例如 81）若現正有車，會排在 81A、181 之上。若 81 現在沒有車、81A 有車，會顯示有車的路線，不會把收車的 81 排在最前。',
          '選上車站後可選此程終點。會顯示開出時間、到達時間、車程，以及可展開的沿途各站時間。終點可留空，此時會跟車至路線最後一站。'
        ]
      },
      {
        h: '附近車站與地圖',
        p: [
          '按「附近車站」後會用地圖顯示附近的站柱。馬路兩邊、同一地點的對面站會合成一個點。點一下即顯示該處所有營辦商的實時路線，可按「跟這班車」。',
          '移動地圖會更新視野內的車站。沒有座標的站不會出現。',
          '選好路線後，地圖會盡量畫出沿道路的行車線（OpenStreetMap 已繪巴士路線，否則用沿路路徑），不是站與站直線。可在「路線地圖」練習場對照。找不到繪好路線時會說明，不會編造路徑。'
        ]
      },
      {
        h: '轉乘助手',
        p: [
          '先選第一程路線、上車站、轉車站和終點。轉車站只會列出上車站之後的站（同站轉車除外），不能選已經過的站。',
          '直達：同一程可到終點，無需轉車。轉乘：第一程到轉車站後再轉另一程。每程都會顯示到達時間、全程車程，以及可展開的沿途各站。轉乘總車程由第一程開出計到到達終點。',
          '趕不上的接駁班次會標明可能趕不上，不會當成可靠行程。'
        ]
      },
      {
        h: '車費',
        p: [
          '搜尋結果顯示全程車費。選了上車站後，會顯示由該站到終點（或路線尾站）的八達通分段。沿途各站旁會標示由上車點到該站的車費，做法接近 hkbus.app：一個站對一個價錢，不會列出一長串「$4.3 / $5.8 / …」。',
          '沒有資料的分段不會猜測。實際金額以車費機為準。'
        ]
      },
      {
        h: '港鐵／輕鐵',
        p: [
          '選路綫、車站，可選此程終點。會顯示下班車、到達、車程及沿途各站。若列車以本站為終點，會說明沒有沿途各站，不會假裝有時間。輕鐵在同一分頁。'
        ]
      },
      {
        h: '我的回家路線',
        p: [
          '無需登入。儲存在這部裝置（tb-device）。換瀏覽器或清除網站資料後就不會再見到。開啟已儲存的轉乘時，若上車站／轉車站已不合理（例如轉車站在上車之前），不會執行錯誤行程。'
        ]
      },
      {
        h: '誠實原則',
        p: [
          '只顯示營辦商公布的實時到站，或標明「估計」的沿途推算。沒有班次、沒有車費、沒有站名時會直接說沒有，不會填假資料。'
        ]
      }
    ]
  },
  en: {
    title: 'How to use',
    pdf: 'Full user manual (PDF)',
    intro: 'TransitBuddy shows live arrivals for Hong Kong buses, green minibuses, NLB, MTR and Light Rail. Traditional Chinese is the default. If there is no bus, the app says so — it does not invent times.',
    sections: [
      {
        h: 'Bus / minibus arrivals',
        p: [
          'Type a route number and search. Services running now come first. An exact match such as 81 is listed above 81A or 181 only when 81 is actually running. If 81 has finished for the day and 81A is live, you will see 81A.',
          'Choose a boarding stop, optionally a destination. You get departure time, arrival time, travel time, and expandable times at each stop. With no destination, the app follows to the last stop on the route.'
        ]
      },
      {
        h: 'Nearby stops and map',
        p: [
          'Nearby stops opens a street map of poles around you. Opposite stops at the same place are merged into one pin. Tap a pin for live routes at that place, then Follow this bus.',
          'Panning the map refreshes stops in view. Poles without coordinates are omitted.',
          'After you pick a service, the map follows roads when OpenStreetMap has a bus relation, or a road-snapped path otherwise — not a straight line between stops. The Route map playground lets you compare. If no mapped line exists, the app says so and does not invent a path.'
        ]
      },
      {
        h: 'Transfer Buddy',
        p: [
          'Choose the first route, boarding stop, interchange, and destination. Interchange choices are only stops after boarding (except same-stop transfer). You cannot pick a stop the bus has already passed.',
          'Direct: one bus reaches the destination. Transfer: alight at the interchange and board another bus. Each ride shows arrival, total travel time, and expandable stop times. A transfer total is first-bus departure through destination arrival.',
          'Connections you may miss are labelled as such and are not treated as a reliable itinerary.'
        ]
      },
      {
        h: 'Fares',
        p: [
          'Search cards show the full fare. After you pick a boarding stop, the Octopus section fare from that stop is shown. Later stops list the fare from boarding, similar to hkbus.app — one price beside the stop, not a slash list of every section.',
          'Missing fare cells are omitted. Confirm the amount on the bus reader.'
        ]
      },
      {
        h: 'MTR / Light Rail',
        p: [
          'Pick a line and station, optionally a destination. You get the next trains, arrival, travel time and stop times. A train that ends here is described as terminating — no fake onward times. Light Rail is on the same tab.'
        ]
      },
      {
        h: 'My travel home',
        p: [
          'No sign-in. Saved on this device only (tb-device). Another browser or clearing site data will not show them. A saved transfer with an impossible boarding/interchange pair will not be run.'
        ]
      },
      {
        h: 'Honesty',
        p: [
          'Only published live arrivals, or hop times marked as estimates. Empty results, missing fares and missing stop names are shown as empty — never filled in.'
        ]
      }
    ]
  }
};

/** Full bilingual user manual used by public/user-manual.pdf. In-app guide stays short (GUIDE). */
export const MANUAL = {
  zh: {
    title: 'TransitBuddy 使用手冊',
    lead: '香港巴士、專線小巴、嶼巴、港鐵及輕鐵的實時到站與轉乘。預設繁體中文，可用畫面右上角切換 English。無需登入。',
    honesty: '誠實原則：只顯示營辦商公布的實時班次；沒有就會寫沒有。沿途各站若為推算，會標明「估計」。不會編造到站時間或車費。',
    sections: [
      {
        h: '這是什麼',
        p: [
          'TransitBuddy 協助你在街上快速查：這班車何時到、跟這班車何時到終點、要不要轉車、車費大約多少。涵蓋九巴 KMB、龍運 LWB、城巴 Citybus、新大嶼山巴士 NLB、專線小巴 GMB（港島／九龍／新界），以及港鐵與輕鐵。',
          '畫面分四頁：巴士／小巴到站、轉乘助手、港鐵／輕鐵、我的回家路線。右上角還有使用說明（本手冊的精簡版）和重新整理間隔（15 或 30 秒）。'
        ]
      },
      {
        h: '如何搜尋路線（正在行駛優先）',
        p: [
          '在巴士／小巴頁輸入路線號碼，按查詢。只顯示現正有車的服務。',
          '你輸入的號碼若現正有車，會排在相近號碼之上。例如查 81：若 81 有車，會排在 81A、181 之前。若 81 已收車而 81A 仍有車，畫面會顯示 81A，不會把沒有車的 81 排在最前佔位置。',
          '搜尋結果只列出有實時到站的方向與營辦商。沒有班次時會寫現在沒有車，不會用時間表假裝有車。'
        ]
      },
      {
        h: '到站、終點、各站時間',
        p: [
          '選路線後選上車站。可再選此程終點；終點只會列出上車之後的站，不能選已經過的站。終點可留空，此時會跟車至路線最後一站。',
          '會顯示開出時間、到達時間、車程（分鐘）。可展開「查看各站時間」。標了估計的時間是沿途推算，不是營辦商逐站公布。',
          '附近車站列表可按「跟這班車」，等同在到站頁選了該路線與該站。'
        ]
      },
      {
        h: '附近車站與地圖',
        p: [
          '按「附近車站」後會開啟街道地圖（OpenStreetMap），顯示大約附近的站柱。需要定位權限才知道你在哪；移動地圖會更新視野內的車站。',
          '馬路兩邊、同一地點的對面站會合成一個點，避免同一個路口出現兩個幾乎重疊的針。點一下即合併顯示該處各營辦商的實時路線。',
          '沒有座標的站不會出現在地圖上。點選後仍沒有班次，就會寫現在沒有車。'
        ]
      },
      {
        h: '轉乘助手：上車與轉車',
        p: [
          '先查第一程路線，再選上車站、轉車站和終點地區。轉車站只會列出上車站當站或之後的站（同站轉車可以），不能選巴士已經過的站。終點必須在轉車站之後才合理。',
          '直達：同一程可到終點，無需轉車。轉乘／接駁：第一程到轉車站後再轉另一程。選了第一程開出時間後，才計算接駁；趕不上的班次會標明可能趕不上，不要當成可靠行程。',
          '每程顯示到達時間、全程車程，以及可展開的沿途各站。轉乘總車程由第一程開出計到到達終點，不是只計第二程。'
        ]
      },
      {
        h: '車費（接近 hkbus.app）',
        p: [
          '搜尋結果顯示全程車費。選了上車站後，顯示由該站到終點（或路線尾站）的一個八達通分段價。沿途各站旁標示由上車點到該站的價錢：一個站對一個價錢，不會列出「$4.3 / $5.8 / …」一長串。',
          '資料來自運輸署分段表。沒有該格就留空，不會猜測。實際以車費機為準。有公布的轉乘優惠會另外標示，仍請在車上看清楚。'
        ]
      },
      {
        h: '港鐵與輕鐵',
        p: [
          '選路綫與車站，可選此程終點。只列出會經過該終點的列車，並顯示到達、車程及沿途各站。',
          '若列車以本站為終點，會說明沒有沿途各站，不會假裝有下一站時間。輕鐵在同一分頁。馬場等不是每日服務的站，沒有車時會誠實顯示沒有。'
        ]
      },
      {
        h: '我的回家路線（只在這部裝置）',
        p: [
          '無需登入、沒有帳戶。儲存在這部手機或電腦的瀏覽器（tb-device）。可從到站、轉乘或港鐵頁面按儲存，之後一按即可重開。',
          '換瀏覽器、換手機或清除網站資料後就不會再見到。開啟已儲存的轉乘時，若上車站／轉車站已不合理（例如轉車站在上車之前），不會執行錯誤行程。'
        ]
      },
      {
        h: '沒有結果時',
        p: [
          '沒有班次、沒有站名、沒有車費、城巴站名對不上時，會顯示「沒有」或通用「車站」字樣，不會用站號假裝成地名，也不會填假的分鐘數。',
          '標了「估計」的沿途時間是推算。重新整理間隔可在右上角改為 15 或 30 秒。語言與回家路線都只存在這部裝置。'
        ]
      }
    ]
  },
  en: {
    title: 'TransitBuddy user manual',
    lead: 'Live arrivals and transfers for Hong Kong buses, green minibuses, NLB, MTR and Light Rail. Traditional Chinese is the default; use the header button for English. No sign-in.',
    honesty: 'Honesty: only operator-published live trips are shown. Empty means empty. Hop times marked 估計 / est. are estimates. The app does not invent ETAs or fares.',
    sections: [
      {
        h: 'What this app is',
        p: [
          'TransitBuddy is for the street: when the bus comes, when you arrive if you board it, whether you need a transfer, and roughly what it costs. It covers KMB, LWB, Citybus, NLB, green minibuses (Hong Kong Island / Kowloon / New Territories), MTR and Light Rail.',
          'Four tabs: bus/minibus arrivals, Transfer Buddy, MTR/Light Rail, and My travel home. The header also has this guide (short version) and a 15- or 30-second refresh interval.'
        ]
      },
      {
        h: 'How to search (live services first)',
        p: [
          'On the bus/minibus tab, type a route number and search. Only services with a live arrival are listed.',
          'An exact match such as 81 is listed above 81A or 181 only when 81 is actually running. If 81 has finished and 81A is live, you see 81A — a dead 81 does not sit on top or fill the list.',
          'Directions and operators with no live buses are omitted. The app says there is no bus now; it does not pretend with a timetable.'
        ]
      },
      {
        h: 'Arrivals, destination, stop times',
        p: [
          'After a route, pick a boarding stop. You may pick a destination on the same trip; only later stops are offered. Leave destination empty to follow to the last stop.',
          'You get departure, arrival, travel time, and expandable times at each stop. Times marked as estimates are inferred along the route, not stop-by-stop operator feeds.',
          'From nearby results, Follow this bus opens that route and stop on the arrivals tab.'
        ]
      },
      {
        h: 'Nearby stops and map',
        p: [
          'Nearby stops opens an OpenStreetMap street map of poles around you. Location permission is used to place you; panning refreshes stops in view.',
          'Opposite poles at the same place are merged into one pin so a junction does not show two overlapping markers. Tap a pin for live routes from every operator at that place.',
          'Poles without coordinates are omitted. If nothing is running, the app says so.'
        ]
      },
      {
        h: 'Transfer Buddy: board vs interchange',
        p: [
          'Search the first route, then boarding stop, interchange, and destination area. Interchange choices are the boarding stop or later stops (same-stop transfer is allowed). You cannot pick a stop the bus has already passed. The destination must be after the interchange.',
          'Direct: one bus reaches the destination. Transfer/connection: alight at the interchange and board another bus. Connecting trips are timed only after you pick a first-bus departure. Connections you may miss are labelled as such and are not a reliable itinerary.',
          'Each ride shows arrival, total travel time, and expandable stop times. A transfer total is first-bus departure through destination arrival, not only the second bus.'
        ]
      },
      {
        h: 'Fares (hkbus.app style)',
        p: [
          'Search cards show the full fare. After boarding, one Octopus section fare is shown from that stop to the destination or terminus. Later stops show the fare from boarding — one price beside the stop, not a slash list of every section.',
          'Figures come from Transport Department section tables. A missing cell is omitted, never guessed. Confirm on the bus reader. Published interchange discounts may appear; still check on the vehicle.'
        ]
      },
      {
        h: 'MTR and Light Rail',
        p: [
          'Pick a line and station, optionally a destination. Only trains that serve that destination are listed, with arrival, travel time and stop times.',
          'A train that ends here is described as terminating — no fake onward times. Light Rail is on the same tab. Stations that do not run every day (for example Racecourse) show empty when there is no service.'
        ]
      },
      {
        h: 'My travel home (this device only)',
        p: [
          'No sign-in and no account. Saved in this browser on this device (tb-device). Save from arrivals, transfer or MTR, then reopen in one tap.',
          'Another browser, another phone, or clearing site data will not show them. A saved transfer with an impossible boarding/interchange pair will not be run.'
        ]
      },
      {
        h: 'When results are empty',
        p: [
          'No live trip, missing fare, or missing stop name is shown as empty. A Citybus pole without a real name is labelled Stop / 車站, never as a raw stop id pretending to be a place. Minutes are never invented.',
          'Times marked estimate are inferred. Refresh is 15 or 30 seconds from the header. Language and homes stay on this device only.'
        ]
      }
    ]
  }
};
