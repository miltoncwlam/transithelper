export const GUIDE = {
  zh: {
    title: '使用說明',
    pdf: '完整使用手冊（PDF）',
    intro: 'TransitBuddy 顯示香港巴士、專線小巴、嶼巴與港鐵的實時到站。預設繁體中文。沒有的班次就會寫沒有，不會編造時間。',
    sections: [
      {
        h: '巴士／小巴到站',
        p: [
          '輸入路線號碼後按「查詢」，才會載入班次。正在輸入時不會搜尋。同一路線的各方向會收成一張卡片；有實時班次的方向列在前面，沒有實時的收在「沒有實時班次」。九巴與城巴同一起訖會標成九巴／城巴。只有一個實時方向時會自動選取。',
          '選好路線後，用地圖或可搜尋的車站名單選上車站，即顯示該站實時到站。終點可留空，此時會跟車至路線最後一站。地圖畫在本頁，是運輸署公布走線。'
        ]
      },
      {
        h: '轉乘助手',
        p: [
          '先選第一程路線、上車站、轉車站和終點。轉車站只會列出上車站之後的站（同站轉車除外）。按「顯示即將開出班次」後，先選第一程；前三班較完整，其餘用較短按鈕。直達只顯示每條路線最早一班。',
          '選好第一程後會鎖定該班車，自動重新整理時不會改成下一班，也不會用空白結果蓋掉已有名單。選好轉乘後同樣只留意該班接駁；趕不上會標明，不會當成可靠行程。'
        ]
      },
      {
        h: '車費',
        p: [
          '搜尋結果顯示全程車費。選了上車站後，會顯示由該站到終點（或路線尾站）的八達通分段。沿途各站旁會標示由上車點到該站的車費。沒有資料的分段不會猜測。實際金額以車費機為準。'
        ]
      },
      {
        h: '港鐵',
        p: [
          '選路綫、車站，可選此程終點。會顯示下班車、到達、車程及沿途各站。若列車以本站為終點，會說明沒有沿途各站。'
        ]
      },
      {
        h: '我的回家路線',
        p: [
          '無需登入。儲存在這部裝置。換瀏覽器或清除網站資料後就不會再見到。開啟已儲存的轉乘時，若上車站／轉車站已不合理，不會執行錯誤行程。'
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
    intro: 'TransitBuddy shows live arrivals for Hong Kong buses, green minibuses, NLB and MTR. Traditional Chinese is the default. If there is no bus, the app says so — it does not invent times.',
    sections: [
      {
        h: 'Bus / minibus arrivals',
        p: [
          'Type a route number, then tap Search — typing alone does not search. Bounds of the same route sit on one card; live trips are listed first, idle ones behind “no live trips”. Joint KMB and Citybus of the same origin and destination appear as one KMB / Citybus row. A single live bound is picked automatically.',
          'After a route, pick a boarding stop from the searchable list or the map. You may pick a destination on the same trip; leave it empty to follow to the last stop. The official path is drawn on this tab.'
        ]
      },
      {
        h: 'Transfer Buddy',
        p: [
          'Choose the first route, boarding stop, interchange, and destination. Interchange choices are only stops after boarding (except same-stop transfer). Upcoming first buses: the next three as full cards, the rest as compact chips. Directs are one row per route (earliest).',
          'After you pick a first bus, the app locks onto that trip. Silent refresh does not switch to the next bus or wipe a filled list with an empty timeout. A chosen connection is tracked the same way. Connections you may miss are labelled as such.'
        ]
      },
      {
        h: 'Fares',
        p: [
          'Search cards show the full fare. After you pick a boarding stop, the Octopus section fare from that stop is shown. Later stops list the fare from boarding. Missing fare cells are omitted. Confirm the amount on the bus reader.'
        ]
      },
      {
        h: 'MTR',
        p: [
          'Pick a line and station, optionally a destination. The app shows next trains, arrival, travel time and stop times. A train that ends here is described as terminating.'
        ]
      },
      {
        h: 'My travel home',
        p: [
          'No sign-in. Saved on this device only. Another browser or clearing site data will not show them. A saved transfer with an impossible boarding/interchange pair will not be run.'
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
    lead: '香港巴士、專線小巴、嶼巴與港鐵的實時到站與轉乘。預設繁體中文，可用畫面右上角切換 English。無需登入。',
    honesty: '誠實原則：只顯示營辦商公布的實時班次；沒有就會寫沒有。沿途各站若為推算，會標明「估計」。不會編造到站時間或車費。',
    sections: [
      {
        h: '這是什麼',
        p: [
          'TransitBuddy 協助你在街上快速查：這班車何時到、跟這班車何時到終點、要不要轉車、車費大約多少。涵蓋九巴 KMB、龍運 LWB、城巴 Citybus、新大嶼山巴士 NLB、專線小巴 GMB（港島／九龍／新界），以及港鐵。',
          '畫面分四頁：巴士／小巴到站、轉乘助手、港鐵、我的回家路線。右上角還有使用說明（本手冊的精簡版）和重新整理間隔（15 或 30 秒）。'
        ]
      },
      {
        h: '如何搜尋路線（按查詢才搜）',
        p: [
          '在巴士／小巴頁輸入路線號碼，必須按「查詢」才載入。打字過程不會搜尋，避免名單在你還在輸入時跳動。',
          '同一路線收成一張卡片。有實時班次的方向列在前面；沒有實時的收在「沒有實時班次」。九巴與城巴同一起訖會合成一列「九巴／城巴」。只有一個實時方向時會自動選取。',
          '你輸入的號碼若現正有車，會排在相近號碼之上。沒有班次時會寫現在沒有車，不會用時間表假裝有車。'
        ]
      },
      {
        h: '到站、終點、地圖與各站時間',
        p: [
          '選路線後，用可搜尋的車站名單或點地圖站號選上車站。可再選此程終點；終點只會列出上車之後的站。終點可留空，此時會跟車至路線最後一站。',
          '地圖畫在巴士／小巴頁，是運輸署公布走線。找不到官方走線時會說明，不會編造路徑。',
          '會顯示開出時間、到達時間、車程（分鐘）。可展開「查看各站時間」。標了估計的時間是沿途推算，不是營辦商逐站公布。'
        ]
      },
      {
        h: '轉乘助手：上車與轉車',
        p: [
          '先查第一程路線（同樣要按查詢），再選上車站、轉車站和終點地區。車站名單可搜尋。轉車站只會列出上車站當站或之後的站。',
          '直達：同一程可到終點，無需轉車，每條路線只顯示最早一班。轉乘：先選第一程；前三班較完整，其餘用較短按鈕。選了第一程後才計算接駁。',
          '選好第一程後會鎖定該班車。自動重新整理時，若新結果是逾時或空白，會保留畫面上已有的班次名單，不會變成「沒有巴士」。選好轉乘後同樣只留意該班接駁。趕不上會標明，不要當成可靠行程。'
        ]
      },
      {
        h: '車費（接近 hkbus.app）',
        p: [
          '搜尋結果顯示全程車費。選了上車站後，顯示由該站到終點（或路線尾站）的一個八達通分段價。沿途各站旁標示由上車點到該站的價錢。',
          '資料來自運輸署分段表。沒有該格就留空，不會猜測。實際以車費機為準。'
        ]
      },
      {
        h: '港鐵',
        p: [
          '選路綫與車站，可選此程終點。港鐵只列出會經過該終點的列車，並顯示到達、車程及沿途各站。',
          '若列車以本站為終點，會說明沒有沿途各站。馬場等不是每日服務的站，沒有車時會誠實顯示沒有。'
        ]
      },
      {
        h: '我的回家路線（只在這部裝置）',
        p: [
          '無需登入、沒有帳戶。儲存在這部手機或電腦的瀏覽器。可從到站、轉乘或港鐵頁面按儲存，之後一按即可重開。',
          '換瀏覽器、換手機或清除網站資料後就不會再見到。開啟已儲存的轉乘時，若上車站／轉車站已不合理，不會執行錯誤行程。'
        ]
      },
      {
        h: '沒有結果時',
        p: [
          '沒有班次、沒有站名、沒有車費時，會顯示「沒有」，不會填假的分鐘數。',
          '標了「估計」的沿途時間是推算。重新整理間隔可在右上角改為 15 或 30 秒。語言與回家路線都只存在這部裝置。'
        ]
      }
    ]
  },
  en: {
    title: 'TransitBuddy user manual',
    lead: 'Live arrivals and transfers for Hong Kong buses, green minibuses, NLB and MTR. Traditional Chinese is the default; use the header button for English. No sign-in.',
    honesty: 'Honesty: only operator-published live trips are shown. Empty means empty. Hop times marked 估計 / est. are estimates. The app does not invent ETAs or fares.',
    sections: [
      {
        h: 'What this app is',
        p: [
          'TransitBuddy is for the street: when the bus comes, when you arrive if you board it, whether you need a transfer, and roughly what it costs. It covers KMB, LWB, Citybus, NLB, green minibuses (Hong Kong Island / Kowloon / New Territories), and MTR.',
          'Four tabs: bus/minibus arrivals, Transfer Buddy, MTR, and My travel home. The header also has this guide (short version) and a 15- or 30-second refresh interval.'
        ]
      },
      {
        h: 'How to search (Search button only)',
        p: [
          'On the bus/minibus tab, type a route number and tap Search. Typing does not search by itself.',
          'Each route number is one card. Live bounds are listed first; idle ones sit behind “no live trips”. Joint KMB and Citybus of the same origin and destination appear as one KMB / Citybus row. A single live bound is picked automatically.',
          'An exact match such as 81 is listed above 81A only when 81 is actually running. The app says there is no bus now; it does not pretend with a timetable.'
        ]
      },
      {
        h: 'Arrivals, destination, map, stop times',
        p: [
          'After a route, pick a boarding stop from the searchable selector or the map. You may pick a destination on the same trip; only later stops are offered. Leave destination empty to follow to the last stop.',
          'The map on this tab draws the Transport Department official bus path. If no official line exists, the app says so and does not invent a path.',
          'You get departure, arrival, travel time, and expandable times at each stop. Times marked as estimates are inferred along the route.'
        ]
      },
      {
        h: 'Transfer Buddy: board vs interchange',
        p: [
          'Search the first route (tap Search), then boarding stop, interchange, and destination area. Stop lists are searchable. Interchange choices are the boarding stop or later stops.',
          'Direct: one bus reaches the destination — one row per route, earliest trip. Transfer: pick a first-bus departure; the next three are full cards, later ones are compact chips. Connecting trips are timed only after you pick a first bus.',
          'After you pick a first bus, the app locks onto that trip. Silent refresh keeps a filled list if the new payload is a timeout or empty. A chosen connection is tracked the same way. Connections you may miss are labelled as such.'
        ]
      },
      {
        h: 'Fares (hkbus.app style)',
        p: [
          'Search cards show the full fare. After boarding, one Octopus section fare is shown from that stop to the destination or terminus. Later stops show the fare from boarding.',
          'Figures come from Transport Department section tables. A missing cell is omitted, never guessed. Confirm on the bus reader.'
        ]
      },
      {
        h: 'MTR',
        p: [
          'Pick a line and station, optionally a destination. MTR lists only trains that serve that destination, with arrival, travel time and stop times.',
          'A train that ends here is described as terminating. Stations that do not run every day (for example Racecourse) show empty when there is no service.'
        ]
      },
      {
        h: 'My travel home (this device only)',
        p: [
          'No sign-in and no account. Saved in this browser on this device. Save from arrivals, transfer or MTR, then reopen in one tap.',
          'Another browser, another phone, or clearing site data will not show them. A saved transfer with an impossible boarding/interchange pair will not be run.'
        ]
      },
      {
        h: 'When results are empty',
        p: [
          'No live trip, missing fare, or missing stop name is shown as empty. Minutes are never invented.',
          'Times marked estimate are inferred. Refresh is 15 or 30 seconds from the header. Language and homes stay on this device only.'
        ]
      }
    ]
  }
};
