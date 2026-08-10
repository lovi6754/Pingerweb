const $ =
  (id) =>
    document.getElementById(id);

let projects = [];

const TOKEN_KEY =
  "my_pinger_token";


// ======================================================
// TOKEN
// ======================================================

function token() {

  return (
    localStorage.getItem(
      TOKEN_KEY
    ) || ""
  );
}


function authHeaders() {

  const t =
    token();

  return t
    ? {
        Authorization:
          "Bearer " + t
      }
    : {};
}


// ======================================================
// API
// ======================================================

async function api(
  url,
  options = {}
) {

  const headers = {

    "Content-Type":
      "application/json",

    ...authHeaders(),

    ...(options.headers || {})

  };


  const response =
    await fetch(
      url,
      {
        ...options,
        headers
      }
    );


  const text =
    await response.text();


  let data;


  try {

    data =
      text
        ? JSON.parse(text)
        : {};

  } catch {

    throw new Error(
      `Server response error (${response.status}): ${text.substring(0, 150)}`
    );
  }


  if (
    response.status === 401
  ) {

    localStorage.removeItem(
      TOKEN_KEY
    );

    showLogin();

    throw new Error(
      data.error ||
        "Session expired. Please login again."
    );
  }


  if (!response.ok) {

    throw new Error(
      data.error ||
        "Request failed."
    );
  }


  return data;
}


// ======================================================
// LOGIN / APP SCREEN
// ======================================================

function showLogin() {

  $("loginScreen")
    .classList
    .remove("hidden");


  $("appShell")
    .classList
    .add("hidden");
}


function showApp() {

  $("loginScreen")
    .classList
    .add("hidden");


  $("appShell")
    .classList
    .remove("hidden");
}


// ======================================================
// START
// ======================================================

async function start() {

  const savedToken =
    token();


  if (!savedToken) {

    showLogin();

    return;
  }


  try {

    await api(
      "/api/auth/check"
    );


    showApp();


    await load();

  } catch {

    localStorage.removeItem(
      TOKEN_KEY
    );

    showLogin();
  }
}


// ======================================================
// LOGIN
// ======================================================

async function login(event) {

  event.preventDefault();


  $("loginError")
    .textContent = "";


  const key =
    $("loginKey")
      .value
      .trim();


  if (!key) {

    $("loginError")
      .textContent =
        "Please enter your access key.";

    return;
  }


  try {

    const response =
      await fetch(
        "/api/login",
        {

          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json"

          },

          body:
            JSON.stringify({
              key
            })

        }
      );


    // IMPORTANT:
    // Read text first.
    // This prevents Unexpected token N
    // when server sends "Not Found".

    const text =
      await response.text();


    let data;


    try {

      data =
        text
          ? JSON.parse(text)
          : {};

    } catch {

      throw new Error(
        `Server response error (${response.status}): ${text.substring(0, 150)}`
      );
    }


    if (!response.ok) {

      throw new Error(
        data.error ||
          "Invalid access key."
      );
    }


    if (!data.token) {

      throw new Error(
        "Login successful but server did not return a session token."
      );
    }


    localStorage.setItem(
      TOKEN_KEY,
      data.token
    );


    $("loginKey")
      .value = "";


    showApp();


    await load();

  } catch (error) {

    $("loginError")
      .textContent =
        error.message;
  }
}


// ======================================================
// LOGOUT
// ======================================================

async function logout() {

  try {

    await api(
      "/api/logout",
      {
        method:
          "POST"
      }
    );

  } catch (_) {}


  localStorage.removeItem(
    TOKEN_KEY
  );


  showLogin();
}


// ======================================================
// SHOW / HIDE PASSWORD
// ======================================================

$("loginForm")
  .addEventListener(
    "submit",
    login
  );


$("showKey")
  .addEventListener(
    "click",
    () => {

      const input =
        $("loginKey");


      if (
        input.type ===
        "password"
      ) {

        input.type =
          "text";

        $("showKey")
          .textContent =
          "Hide";

      } else {

        input.type =
          "password";

        $("showKey")
          .textContent =
          "Show";
      }
    }
  );


// ======================================================
// ESCAPE HTML
// ======================================================

function esc(value) {

  return String(
    value ?? ""
  ).replace(
    /[&<>"']/g,
    (char) => {

      const map = {

        "&":
          "&amp;",

        "<":
          "&lt;",

        ">":
          "&gt;",

        '"':
          "&quot;",

        "'":
          "&#039;"

      };


      return map[char];
    }
  );
}


// ======================================================
// TIME
// ======================================================

function ago(value) {

  if (!value) {

    return "Never";
  }


  const minutes =
    Math.floor(
      (
        Date.now() -
        new Date(value)
          .getTime()
      ) /
      60000
    );


  if (minutes < 1) {

    return "Just now";
  }


  if (minutes < 60) {

    return (
      minutes +
      " min ago"
    );
  }


  const hours =
    Math.floor(
      minutes / 60
    );


  const remaining =
    minutes % 60;


  return (
    hours +
    "h " +
    remaining +
    "m ago"
  );
}


// ======================================================
// RENDER
// ======================================================

function render() {

  $("total")
    .textContent =
      projects.length;


  $("online")
    .textContent =
      projects.filter(
        (project) =>
          project.status ===
          "ONLINE"
      ).length;


  $("issues")
    .textContent =
      projects.filter(
        (project) =>
          [
            "OFFLINE",
            "ERROR"
          ].includes(
            project.status
          )
      ).length;


  $("updated")
    .textContent =
      new Date()
        .toLocaleTimeString(
          [],
          {
            hour:
              "2-digit",

            minute:
              "2-digit"
          }
        );


  $("count")
    .textContent =
      `${projects.length} monitored endpoint${
        projects.length === 1
          ? ""
          : "s"
      }`;


  if (
    !projects.length
  ) {

    $("projects")
      .innerHTML =
        `
        <div class="empty">
          No projects added yet.
          <br>
          Add your first URL above.
        </div>
        `;


    $("next")
      .textContent =
        "Waiting";


    return;
  }


  const next =
    projects

      .filter(
        (project) =>
          project.active &&
          project.lastPing
      )

      .map(
        (project) =>
          new Date(
            project.lastPing
          ).getTime() +
          project.intervalMinutes *
            60000
      )

      .sort(
        (a, b) =>
          a - b
      )[0];


  $("next")
    .textContent =
      next
        ? new Date(
            next
          ).toLocaleTimeString(
            [],
            {
              hour:
                "2-digit",

              minute:
                "2-digit"
            }
          )
        : "Within 1 min";


  $("projects")
    .innerHTML =
      projects
        .map(
          (project) => `

        <article class="project">

          <div class="project-head">

            <div>

              <div class="name">
                ${esc(
                  project.name
                )}
              </div>

              <div class="url">
                ${esc(
                  project.url
                )}
              </div>

            </div>


            <span
              class="badge ${esc(
                project.status
              )}"
            >
              ${esc(
                project.status
              )}
            </span>

          </div>


          <div class="metrics">

            <div class="metric">

              <small>
                HTTP
              </small>

              <b>
                ${
                  project.httpCode ??
                  "—"
                }
              </b>

            </div>


            <div class="metric">

              <small>
                RESPONSE
              </small>

              <b>
                ${
                  project.responseMs != null
                    ? project.responseMs +
                      " ms"
                    : "—"
                }
              </b>

            </div>


            <div class="metric">

              <small>
                INTERVAL
              </small>

              <b>
                ${
                  project.intervalMinutes
                } min
              </b>

            </div>

          </div>


          <div class="last">

            Last ping:
            ${ago(
              project.lastPing
            )}

            ${
              project.lastPing
                ? " • " +
                  new Date(
                    project.lastPing
                  ).toLocaleString()
                : ""
            }

          </div>


          ${
            project.lastError
              ? `
                <div class="err">
                  ${esc(
                    project.lastError
                  )}
                </div>
              `
              : ""
          }


          <div class="actions">

            <button
              onclick="ping('${project._id}')"
            >
              ↯ Ping now
            </button>


            <button
              onclick="toggleProject(
                '${project._id}',
                ${!project.active}
              )"
            >
              ${
                project.active
                  ? "Pause"
                  : "Resume"
              }
            </button>


            <button
              class="danger"
              onclick="removeProject(
                '${project._id}'
              )"
            >
              Delete
            </button>

          </div>

        </article>

      `
        )
        .join("");
}


// ======================================================
// LOAD
// ======================================================

async function load() {

  try {

    projects =
      await api(
        "/api/projects"
      );


    render();

  } catch (error) {

    toast(
      error.message,
      true
    );
  }
}


// ======================================================
// MANUAL PING
// ======================================================

async function ping(id) {

  toast(
    "Pinging..."
  );


  try {

    await api(
      `/api/projects/${id}/ping`,
      {
        method:
          "POST"
      }
    );


    await load();


    toast(
      "Ping completed."
    );

  } catch (error) {

    toast(
      error.message,
      true
    );
  }
}


// ======================================================
// PAUSE / RESUME
// ======================================================

async function toggleProject(
  id,
  active
) {

  try {

    await api(
      `/api/projects/${id}`,
      {

        method:
          "PATCH",

        body:
          JSON.stringify({
            active
          })

      }
    );


    await load();

  } catch (error) {

    toast(
      error.message,
      true
    );
  }
}


// ======================================================
// DELETE
// ======================================================

async function removeProject(
  id
) {

  if (
    !confirm(
      "Remove this project?"
    )
  ) {

    return;
  }


  try {

    await api(
      `/api/projects/${id}`,
      {
        method:
          "DELETE"
      }
    );


    await load();


    toast(
      "Project removed."
    );

  } catch (error) {

    toast(
      error.message,
      true
    );
  }
}


// ======================================================
// TOAST
// ======================================================

function toast(
  message,
  error = false
) {

  $("toast")
    .textContent =
      message;


  $("toast")
    .style.color =
      error
        ? "#ff8997"
        : "#9eacd0";
}


// ======================================================
// ADD PROJECT
// ======================================================

$("form")
  .addEventListener(
    "submit",
    async (event) => {

      event.preventDefault();


      toast(
        "Adding project and running first ping..."
      );


      try {

        await api(
          "/api/projects",
          {

            method:
              "POST",

            body:
              JSON.stringify({

                name:
                  $("name")
                    .value
                    .trim(),

                url:
                  $("url")
                    .value
                    .trim(),

                interval:
                  Number(
                    $("interval")
                      .value
                  )

              })

          }
        );


        event.target.reset();


        $("interval")
          .value =
          "10";


        await load();


        toast(
          "Project added successfully."
        );

      } catch (error) {

        toast(
          error.message,
          true
        );
      }
    }
  );


// ======================================================
// START
// ======================================================

start();


// Refresh dashboard every 30 sec.
// Server-side scheduler is independent.
setInterval(
  () => {

    if (token()) {

      load();

    }

  },
  30000
);
