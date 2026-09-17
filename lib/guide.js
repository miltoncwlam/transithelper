export const GUIDE = {
  zh: {
    title: '使用說明',
    pdf: '完整使用手冊（PDF）',
    intro: 'TransitBuddy 顯示香港巴士、專線小巴、嶼巴、港鐵巴士與港鐵／輕鐵的實時到站。預設繁體中文。沒有的班次就會寫沒有，不會編造時間。',
    sections: [
      {
        h: '巴士／小巴到站',
        p: [
          '輸入路線號碼後按「查詢」，才會載入班次。正在輸入時不會搜尋。同一路線的各方向會收成一張卡片；有實時班次的方向列在前面，沒有實時的收在「沒有實時班次」。九巴與城巴同一起訖會標成九巴／城巴。只有一個實時方向時會自動選取。港鐵巴士（例如 K12）同樣用路線號碼查詢。',
          '沒有上次巴士時，到站頁會先用定位顯示附近站柱現正公布的巴士與小巴，不必先按「附近到站」。沒有公布就會留空。拒絕定位時仍可輸入路線。可把該位置儲存為回家附近或返工附近：儲存後仍留在到站頁，每種只保留一處。之後可按到站頁的「回家附近」或「返工附近」重開該位置的實時牌。上次巴士會還原，不會改去「我的回家路線」。',
          '選好路線後，用地圖或可搜尋的車站名單選上車站，即顯示該站實時到站。按「就乘這一程」鎖定這一班，自動更新時不會改成下一班。若趕不上，按「錯過了」：顯示本站下一班同一路線；若已選終點，也會列出目前較快到達的實時選擇。不會叫你跑去下一站趕這一班。終點可留空，此時會跟車至路線最後一站。地圖畫在本頁，是運輸署公布走線。右上角可把時間改為鐘面或倒數。'
        ]
      },
      {
        h: '路線規劃',
        p: [
          '選起點和終點，像地圖一樣列出可乘的實時巴士／小巴。不必先選路線。起點可按「用我的位置」。輸入站名就會出現名單。',
          '按「搜尋」後（選好兩端也會自動搜）會列出實時選擇：路線、開出、到達、車程、步行、轉車等候和八達通車費。排序同時看車程、轉車（含等候）、步行和車費：只快一兩分鐘的轉乘不會排在直達前面。同一路線合成一格。只顯示現正有實時的路線。點一程即鎖定該班車，自動更新時不會改成下一班。若趕不上，按「錯過了」。',
          '出門規劃收在結果下方，用編定班距和交通估計（不是實時）。選日期（預設明天）和可選的到達時間，會顯示大約出門時間。沒有該天班次就會寫沒有。'
        ]
      },
      {
        h: '錯過了',
        p: [
          '先按「就乘這一程」鎖定這一班。若趕不上，按「錯過了」。只顯示本站下一班同一路線的實時；若已選終點，也會列出目前較快到達的實時選擇。沒有實時就不編造時間表。不會叫你跑去下一站趕這一班。',
          '下一班同一路線不會標成趕這一班。輕鐵只看本站。'
        ]
      },
      {
        h: '車費',
        p: [
          '搜尋結果顯示全程車費。選了上車站後，會顯示由該站到終點（或路線尾站）的八達通分段。沿途各站旁會標示由上車點到該站的車費。沒有資料的分段不會猜測。實際金額以車費機為準。路線規劃會在路線旁顯示八達通車費，並以車程、轉車、步行和車費一併排序。'
        ]
      },
      {
        h: '港鐵',
        p: [
          '選路綫、車站，可選此程終點。會顯示下班車、到達、車程及沿途各站。若列車以本站為終點，會說明沒有沿途各站。路綫名單包括輕鐵；輕鐵沒有班次時會直接說沒有。'
        ]
      },
      {
        h: '我的回家路線',
        p: [
          '無需登入。回家附近／返工附近是該位置的實時到站牌，每種只保留一處，從到站頁一按重開。巴士、路線規劃或港鐵也可儲存。換瀏覽器或清除網站資料後就不會再見到。開啟已儲存的路線規劃時，若上車站／轉車站已不合理，不會執行錯誤行程。'
        ]
      },
      {
        h: '誠實原則',
        p: [
          '只顯示營辦商公布的實時到站，或標明「估計」的沿途推算。沒有班次、沒有車費、沒有站名時會直接說沒有，不會填假資料。鎖定的班次不會改成下一班。錯過了只顯示本站下一班實時與較快選擇，不會叫你跑去下一站趕車。出門規劃的車程若沒有交通數據，只顯示編定時間，不會乘上自訂的繁忙時間倍數。'
        ]
      }
    ]
  },
  en: {
    title: 'How to use',
    pdf: 'Full user manual (PDF)',
    intro: 'TransitBuddy shows live arrivals for Hong Kong buses, green minibuses, NLB, MTR Bus, MTR and Light Rail. Traditional Chinese is the default. If there is no bus, the app says so — it does not invent times.',
    sections: [
      {
        h: 'Bus / minibus arrivals',
        p: [
          'Type a route number, then tap Search — typing alone does not search. Bounds of the same route sit on one card; live trips are listed first, idle ones behind “no live trips”. Joint KMB and Citybus of the same origin and destination appear as one KMB / Citybus row. A single live bound is picked automatically. MTR Bus (for example K12) is searched the same way.',
          'Before picking a route, if there is no last bus to restore, Arrivals loads Nearby arrivals from your location — you do not have to tap the button first. Empty operator feeds stay empty. If location is denied, type a route. You can save that place as home nearby or work nearby: you stay on Arrivals, only one of each is kept, and the Arrivals chips reopen that live board without searching.',
          'After a route, pick a boarding stop from the searchable list or the map. You may pick a destination on the same trip; leave it empty to follow to the last stop. Take this trip locks that clock so refresh does not snap to the next bus. If you miss it, you see the next live trip of the same route at this pole, and a faster live option when a destination is set. The app does not send you walking to the next stop to chase this bus. The official path is drawn on this tab. Use the header to switch clock times and countdown.'
        ]
      },
      {
        h: 'Route planner',
        p: [
          'Pick from and to — like a map. You do not choose a route first. Use my location sets the start from nearby poles. Typing a stop name lists matches.',
          'Search (it also runs after both stops are picked) lists live options: route, depart, arrive, ride time, walking, transfer wait and Octopus fare. Ranking uses travel time, transfer (including wait), walking and fare — a transfer that is only a minute faster does not beat staying on the bus. The same route is merged into one row. Only live trips are listed. Tap a trip to lock it so refresh does not snap to the next bus. If you miss it, use If I missed it.',
          'Leave-home plan sits under the results. It uses published headways and a traffic estimate — not live arrivals. Pick a date (tomorrow by default) and an optional arrive-by time. No trips that day stays empty.'
        ]
      },
      {
        h: 'If you miss it',
        p: [
          'Lock the trip with Take this trip. If you miss it, you see the next live clock of the same route at this pole. With a destination picked, a faster live option is listed when there is one. An empty feed stays empty. The app does not send you to a later stop to chase this bus.',
          'The next bus of this route is never labelled as catching this trip. Light Rail is this stop only.'
        ]
      },
      {
        h: 'Fares',
        p: [
          'Search cards show the full fare. After you pick a boarding stop, the Octopus section fare from that stop is shown. Later stops list the fare from boarding. Missing fare cells are omitted. Confirm the amount on the bus reader. Route planner lists Octopus fares and ranks by time, transfer, walking and fare.'
        ]
      },
      {
        h: 'MTR',
        p: [
          'Pick a line and station, optionally a destination. The app shows next trains, arrival, travel time and stop times. A train that ends here is described as terminating. Light Rail is in the line list; an empty Light Rail feed stays empty.'
        ]
      },
      {
        h: 'My travel home',
        p: [
          'No sign-in. Home nearby and work nearby are live boards for a saved place — one of each — reopened from Arrivals. You can also save a bus, route planner, or MTR view. Another browser or clearing site data will not show them. A saved route with an impossible boarding/interchange pair will not be run.'
        ]
      },
      {
        h: 'Honesty',
        p: [
          'Only published live arrivals, or hop times marked as estimates. Empty results, missing fares and missing stop names are shown as empty — never filled in. A locked trip does not snap to the next bus. If you miss it, the app stays at this pole. Leave-home ride times without a traffic speed stay on the published duration — no invented peak multiplier.'
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
          'TransitBuddy 協助你在街上快速查：這班車何時到、跟這班車何時到終點、要不要轉車、車費大約多少。涵蓋九巴 KMB、龍運 LWB、城巴 Citybus、新大嶼山巴士 NLB、專線小巴 GMB（港島／九龍／新界）、港鐵巴士，以及港鐵與輕鐵。',
          '畫面分四頁：巴士／小巴到站、路線規劃、港鐵、我的回家路線。右上角還有使用說明（本手冊的精簡版）、鐘面／倒數，和重新整理間隔（15 或 30 秒）。'
        ]
      },
      {
        h: '如何搜尋路線（按查詢才搜）',
        p: [
          '在巴士／小巴頁輸入路線號碼，必須按「查詢」才載入。打字過程不會搜尋，避免名單在你還在輸入時跳動。港鐵巴士（例如 K12）同樣用路線號碼。',
          '同一路線收成一張卡片。有實時班次的方向列在前面；沒有實時的收在「沒有實時班次」。九巴與城巴同一起訖會合成一列「九巴／城巴」。只有一個實時方向時會自動選取。',
          '你輸入的號碼若現正有車，會排在相近號碼之上。沒有班次時會寫現在沒有車，不會用時間表假裝有車。'
        ]
      },
      {
        h: '到站、終點、地圖與各站時間',
        p: [
          '選路線後，用可搜尋的車站名單或點地圖站號選上車站。可再選此程終點；終點只會列出上車之後的站。終點可留空，此時會跟車至路線最後一站。按「就乘這一程」鎖定這一班，自動更新時不會改成下一班。若趕不上，按「錯過了」：顯示本站下一班同一路線；若已選終點，也會列出目前較快到達的實時選擇。不會叫你跑去下一站趕這一班。沒有上次巴士時，到站頁會先用定位列出附近站柱現正公布的班次；也可再按「附近到站」。儲存為回家附近或返工附近後仍留在到站頁；每種只保留一處。之後可按到站頁的「回家附近」／「返工附近」重開該位置的實時牌，不必再搜。開啟時沒有公布就會留空。不會在啟動時改去「我的回家路線」。',
          '地圖畫在巴士／小巴頁，是運輸署公布走線。找不到官方走線時會說明，不會編造路徑。',
          '會顯示開出時間、到達時間、車程（分鐘）。可展開「查看各站時間」。標了估計的時間是沿途推算，不是營辦商逐站公布。'
        ]
      },
      {
        h: '路線規劃：由起點到終點',
        p: [
          '選起點和終點，像地圖一樣列出可乘的實時巴士／小巴。不必先選路線。也可按「用我的位置」。輸入站名就會出現名單。',
          '附近站柱會一併考慮，不必再調距離。不必指定第一程或轉車站。',
          '按「搜尋」後（選好兩端也會自動搜）會列出實時選擇：路線、開出、到達、車程、步行、轉車等候和八達通車費。排序同時看車程、轉車（含等候）、步行和車費。同一路線合成一格。只顯示現正有實時的路線。沿途到達若為推算會標「估計」。',
          '出門規劃收在結果下方（日期預設明天），用編定班距和交通估計，不是實時。可選到達時間後顯示大約出門時間；沒有該天班次就會寫沒有。沒有交通車速時只顯示編定車程，不會乘上自訂的繁忙時間倍數。',
          '點一程即鎖定該班車和接駁，並繼續更新這一班的實時狀態。自動重新整理時不會改成下一班。趕不上按「錯過了」。'
        ]
      },
      {
        h: '錯過了',
        p: [
          '先按「就乘這一程」鎖定這一班。若趕不上，按「錯過了」。只顯示本站下一班同一路線的實時；若已選終點，也會列出目前較快到達的實時選擇。沒有實時就不編造時間表。不會叫你跑去下一站趕這一班。',
          '下一班同一路線不會標成趕這一班。輕鐵只公布本站，錯過了可以是本站下班車，不會叫你跑去下一站。'
        ]
      },
      {
        h: '車費（接近 hkbus.app）',
        p: [
          '搜尋結果顯示全程車費。選了上車站後，顯示由該站到終點（或路線尾站）的一個八達通分段價。沿途各站旁標示由上車點到該站的價錢。',
          '資料來自運輸署分段表。沒有該格就留空，不會猜測。實際以車費機為準。路線規劃以車程、轉車、步行和車費一併排序，並顯示八達通車費。'
        ]
      },
      {
        h: '港鐵',
        p: [
          '選路綫與車站，可選此程終點。港鐵只列出會經過該終點的列車，並顯示到達、車程及沿途各站。路綫名單包括輕鐵。',
          '若列車以本站為終點，會說明沒有沿途各站。馬場等不是每日服務的站，沒有車時會誠實顯示沒有。'
        ]
      },
      {
        h: '我的回家路線（只在這部裝置）',
        p: [
          '無需登入、沒有帳戶。儲存在這部手機或電腦的瀏覽器。回家附近／返工附近是該位置的實時到站牌，不是一條巴士；開啟會載入現正公布的班次，沒有公布就會留空。每種只保留一處。已儲存的巴士、路線規劃或港鐵列在下面，一按即可重開。',
          '換瀏覽器、換手機或清除網站資料後就不會再見到。開啟已儲存的路線規劃時，若上車站／轉車站已不合理，不會執行錯誤行程。'
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
          'TransitBuddy is for the street: when the bus comes, when you arrive if you board it, whether you need a transfer, and roughly what it costs. It covers KMB, LWB, Citybus, NLB, green minibuses (Hong Kong Island / Kowloon / New Territories), MTR Bus, MTR and Light Rail.',
          'Four tabs: bus/minibus arrivals, Route planner, MTR, and My travel home. The header also has this guide (short version), clock versus countdown, and a 15- or 30-second refresh interval.'
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
          'After a route, pick a boarding stop from the searchable selector or the map. You may pick a destination on the same trip; only later stops are offered. Leave destination empty to follow to the last stop. Take this trip locks that clock so refresh does not snap to the next bus. If you miss it, you see the next live trip of the same route at this pole, and a faster live option when a destination is set. The app does not send you walking to the next stop to chase this bus. With no last bus to restore, Arrivals loads Nearby arrivals from your location first. Saving home nearby or work nearby stays on Arrivals, keeps one of each, and the chips reopen that live board without searching. An empty feed stays empty. Saved homes do not steal the arrivals tab on boot. A last bus restores instead of auto nearby.',
          'The map on this tab draws the Transport Department official bus path. If no official line exists, the app says so and does not invent a path.',
          'You get departure, arrival, travel time, and expandable times at each stop. Times marked as estimates are inferred along the route.'
        ]
      },
      {
        h: 'Route planner: stop to stop',
        p: [
          'Pick from and to, like a map. You do not pick a bus route first. Use my location is available. Typing a stop name lists matches.',
          'Nearby poles are included automatically. You do not set a first route or transfer stop.',
          'Search (it also runs after both stops are picked) lists live options: route, depart, arrive, ride time, walking, transfer wait and Octopus fare. Ranking uses travel time, transfer (including wait), walking and fare. The same route is merged into one row. Only live trips are listed. Hop arrivals marked 估計 / est. are estimates.',
          'Leave-home plan sits under the results (date defaults to tomorrow). It uses published headways and a traffic estimate, not live clocks. An optional arrive-by time yields an estimated leave-home clock. No trips that day stays empty. Without a traffic speed, ride time stays on the published duration — no invented peak multiplier.',
          'Tap a trip to lock those exact buses. Refresh does not snap to the next bus. If you miss it, use If I missed it.'
        ]
      },
      {
        h: 'If you miss it',
        p: [
          'Lock the trip with Take this trip. If you miss it, you see the next live clock of the same route at this pole. With a destination picked, a faster live option is listed when there is one. The app does not send you walking to the next stop to chase this bus. An empty feed stays empty.',
          'The next bus of this route is never labelled as catching this trip. No second live clock means the app says there is no next live trip. Light Rail is this stop only; miss-cost can still be the next live train here.'
        ]
      },
      {
        h: 'Fares (hkbus.app style)',
        p: [
          'Search cards show the full fare. After boarding, one Octopus section fare is shown from that stop to the destination or terminus. Later stops show the fare from boarding.',
          'Figures come from Transport Department section tables. A missing cell is omitted, never guessed. Confirm on the bus reader. Route planner ranks by time, transfer, walking and fare, and shows the Octopus fare.'
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
          'No sign-in and no account. Saved in this browser on this device. Home nearby and work nearby are live boards for a place, not a single bus: Open reloads what is published now, and an empty feed stays empty. Only one home and one work. Saved buses, route planner and MTR sit below.',
          'Another browser, another phone, or clearing site data will not show them. A saved route with an impossible boarding/interchange pair will not be run.'
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
