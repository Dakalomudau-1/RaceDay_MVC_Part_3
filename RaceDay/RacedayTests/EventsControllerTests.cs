using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.AspNetCore.Mvc;
using RaceDay.Controllers;
using RaceDay.Models;
using RaceDay.NewFolder;
using Xunit;

namespace RacedayTests
{
    public class EventsControllerTests
    {
        private DataStore CreateMockDataStore()
        {
            var store = new DataStore
            {
                Organisers = new List<Organiser>
                {
                    new Organiser { OrganiserId = 1, UserId = 1, FullName = "John Doe" },
                    new Organiser { OrganiserId = 2, UserId = 3, FullName = "Jane Smith" }
                },
                Events = new List<Event>
                {
                    new Event
                    {
                        EventId = 1, OrganiserId = 1, Name = "London Marathon",
                        Location = "London", EventType = "Run",
                        EventDate = new DateTime(2026, 10, 15), DistanceKm = 42
                    },
                    new Event
                    {
                        EventId = 2, OrganiserId = 2, Name = "Paris Cycle Tour",
                        Location = "Paris", EventType = "Cycle",
                        EventDate = new DateTime(2026, 11, 20), DistanceKm = 100
                    }
                }
            };
            return store;
        }

        [Fact]
        public void GetEvents_NoFilters_ReturnsAllEvents()
        {
            var controller = new EventsController(CreateMockDataStore());

            var result = controller.GetEvents(null, null, null, null);

            var okResult = Assert.IsType<OkObjectResult>(result);
            var resultList = Assert.IsAssignableFrom<IEnumerable<object>>(okResult.Value);
            Assert.Equal(2, resultList.Count());
        }

        [Fact]
        public void GetEvents_WithEventTypeFilter_ReturnsFilteredEvents()
        {
            var controller = new EventsController(CreateMockDataStore());

            var result = controller.GetEvents("Run", null, null, null);

            var okResult = Assert.IsType<OkObjectResult>(result);
            Assert.Single((IEnumerable<object>)okResult.Value);
        }

        [Fact]
        public void GetEvents_FilterByLocation_ReturnsOnlyParis()
        {
            var controller = new EventsController(CreateMockDataStore());

            var result = controller.GetEvents(null, null, null, "Paris");

            var okResult = Assert.IsType<OkObjectResult>(result);
            Assert.Single((IEnumerable<object>)okResult.Value);
        }

        [Fact]
        public void GetEvents_FilterByDateRange_ReturnsOnlyNovemberEvent()
        {
            var controller = new EventsController(CreateMockDataStore());

            var result = controller.GetEvents(null, new DateTime(2026, 11, 1), new DateTime(2026, 11, 30), null);

            var okResult = Assert.IsType<OkObjectResult>(result);
            Assert.Single((IEnumerable<object>)okResult.Value);
        }

        [Fact]
        public void GetEvents_NoMatch_ReturnsEmptyList()
        {
            var controller = new EventsController(CreateMockDataStore());

            var result = controller.GetEvents("Walk", null, null, null);

            var okResult = Assert.IsType<OkObjectResult>(result);
            Assert.Empty((IEnumerable<object>)okResult.Value);
        }

        [Fact]
        public void GetEvents_CombinedFilters_ReturnsMatchingEvent()
        {
            var controller = new EventsController(CreateMockDataStore());

            var result = controller.GetEvents("Cycle", null, null, "Paris");

            var okResult = Assert.IsType<OkObjectResult>(result);
            Assert.Single((IEnumerable<object>)okResult.Value);
        }

        [Fact]
        public void GetEvent_ValidId_ReturnsEvent()
        {
            var controller = new EventsController(CreateMockDataStore());

            var result = controller.GetEvent(1);

            Assert.IsType<OkObjectResult>(result);
        }

        [Fact]
        public void GetEvent_InvalidId_ReturnsNotFound()
        {
            var controller = new EventsController(CreateMockDataStore());

            var result = controller.GetEvent(99);

            Assert.IsType<NotFoundObjectResult>(result);
        }

        [Fact]
        public void GetEvent_ReturnsOrganiserName()
        {
            var controller = new EventsController(CreateMockDataStore());

            var okResult = Assert.IsType<OkObjectResult>(controller.GetEvent(1));
            var organiser = okResult.Value.GetType().GetProperty("Organiser").GetValue(okResult.Value);
            var fullName = organiser.GetType().GetProperty("FullName").GetValue(organiser);

            Assert.Equal("John Doe", fullName);
        }

        [Fact]
        public void GetEvent_DoesNotExposeOrganiserUserOrPasswordHash()
        {
            var controller = new EventsController(CreateMockDataStore());

            var okResult = Assert.IsType<OkObjectResult>(controller.GetEvent(1));
            var organiser = okResult.Value.GetType().GetProperty("Organiser").GetValue(okResult.Value);

            Assert.Null(organiser.GetType().GetProperty("User"));
        }
    }
}