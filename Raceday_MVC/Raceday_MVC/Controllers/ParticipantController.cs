using Microsoft.AspNetCore.Mvc;

namespace Raceday_MVC.Controllers
{
    public class ParticipantController : Controller
    {
        public IActionResult MyEnrolments()
        {
            return View();
        }

        public IActionResult MyResults()
        {
            return View();
        }

        public IActionResult Profile()
        {
            return View();
        }
    }
}