using Microsoft.AspNetCore.Mvc;

namespace Raceday_MVC.Controllers
{
    public class OrganiserController : Controller
    {
        public IActionResult Enrolments()
        {
            return View();
        }

        public IActionResult CreateEvent()
        {
            return View();
        }

        public IActionResult EditEvent(int id)
        {
            ViewBag.EventId = id;
            return View();
        }

        public IActionResult Results()
        {
            return View();
        }

        public IActionResult Dashboard()
        {
            return View();
        }
    }
}
